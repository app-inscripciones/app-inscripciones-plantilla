-- =====================================================================
-- D45 · Eventos sin cobro (gratuitos)   ·   D46 · Cerrar y volver a abrir las inscripciones
-- Se ejecuta UNA VEZ en el editor SQL de Supabase, después de 001 a 009.
-- Se puede volver a ejecutar sin problemas.
--  · Sin cobro: el formulario no pide pago; la inscripción queda con medio «sin_cobro» y monto 0.
--  · Cerrar inscripciones (Organizador, en cualquier momento: antes, durante o después del evento):
--    no se pueden crear ni activar QR de cargador; los celulares de cargadores pasan a «solo envío».
--    Lo que ya estaba cargado y sin enviar SE RECIBE igual; si se cargó después del cierre, queda
--    marcado «fuera de horario» para revisión (como D38). La puerta (control de presentes) sigue igual.
-- =====================================================================

alter table public.inscripciones drop constraint if exists inscripciones_medio_pago_check;
alter table public.inscripciones add constraint inscripciones_medio_pago_check
  check (medio_pago in ('efectivo', 'terminal', 'transferencia', 'sin_cobro'));
alter table public.inscripciones drop constraint if exists sin_cobro_monto_cero;
alter table public.inscripciones add constraint sin_cobro_monto_cero check (medio_pago <> 'sin_cobro' or monto = 0);

alter table public.eventos add column if not exists inscripciones_cerradas_en timestamptz;
alter table public.eventos add column if not exists inscripciones_cerradas_por text;

-- ---------------------------------------------------------------------
-- PANEL · cerrar o volver a abrir las inscripciones (Organizador, con motivo y auditoría)
-- ---------------------------------------------------------------------
create or replace function public.panel_cerrar_inscripciones(p_evento text, p_cerrar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_evento for update;
  if not found or v_ev.estado <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if p_cerrar then
    if v_ev.inscripciones_cerradas_en is not null then return jsonb_build_object('ok', true, 'cerradasEn', v_ev.inscripciones_cerradas_en); end if;
    update public.eventos set inscripciones_cerradas_en = now(), inscripciones_cerradas_por = public.correo_actual() where id = p_evento;
  else
    if v_ev.inscripciones_cerradas_en is null then return jsonb_build_object('ok', true, 'cerradasEn', null); end if;
    update public.eventos set inscripciones_cerradas_en = null, inscripciones_cerradas_por = null where id = p_evento;
  end if;
  perform public.auditar(case when p_cerrar then 'cerrar_inscripciones' else 'reabrir_inscripciones' end, 'evento', p_evento,
    jsonb_build_object('cerradasEn', v_ev.inscripciones_cerradas_en),
    jsonb_build_object('motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  return jsonb_build_object('ok', true, 'cerradasEn', (select inscripciones_cerradas_en from public.eventos where id = p_evento));
end;
$$;
revoke all on function public.panel_cerrar_inscripciones(text, boolean, text) from public;
grant execute on function public.panel_cerrar_inscripciones(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Funciones anteriores, actualizadas para D45 y D46
-- ---------------------------------------------------------------------
create or replace function public.activar_acceso(p_codigo text, p_dispositivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_acc    public.accesos;
  v_ev     public.eventos;
  v_nombre text;
  v_token  text;
  v_sesion uuid;
begin
  if p_dispositivo is null or length(p_dispositivo) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  select * into v_acc from public.accesos where codigo_hash = public.huella_acceso(p_codigo);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  end if;
  if v_acc.cerrado_en is not null then
    return jsonb_build_object('ok', false, 'error', 'acceso_cerrado');
  end if;
  if v_acc.hasta <= now() then
    return jsonb_build_object('ok', false, 'error', 'acceso_vencido');
  end if;
  select * into v_ev from public.eventos where id = v_acc.evento_id;
  if v_ev.estado <> 'abierto' then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if v_acc.tarea = 'cargar' and v_ev.inscripciones_cerradas_en is not null then
    return jsonb_build_object('ok', false, 'error', 'inscripciones_cerradas');
  end if;
  if not exists (select 1 from public.sesiones where acceso_id = v_acc.id and dispositivo = p_dispositivo)
     and (select count(*) from public.sesiones where acceso_id = v_acc.id) >= v_acc.max_dispositivos then
    return jsonb_build_object('ok', false, 'error', 'ya_activado');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sesiones (acceso_id, dispositivo, token_hash)
  values (v_acc.id, p_dispositivo, public.huella_codigo(v_token))
  on conflict (acceso_id, dispositivo)
    do update set token_hash = excluded.token_hash, ultima_conexion = now()
  returning id into v_sesion;

  select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'sesionId', v_sesion,
    'tarea', v_acc.tarea,
    'colaborador', v_nombre,
    'desde', v_acc.desde,
    'hasta', v_acc.hasta,
    'evento', v_ev.definicion || jsonb_build_object('id', v_ev.id, 'nombre', v_ev.nombre, 'fecha', v_ev.fecha, 'unidad', v_ev.unidad)
  );
end;
$$;
revoke all on function public.activar_acceso(text, text) from public;
grant execute on function public.activar_acceso(text, text) to anon, authenticated;

create or replace function public.estado_sesion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
begin
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  return jsonb_build_object('ok', true, 'ahora', now(), 'desde', v_acc.desde, 'hasta', v_acc.hasta, 'cerradoEn', v_acc.cerrado_en,
    'inscripcionesCerradasEn', (select inscripciones_cerradas_en from public.eventos where id = v_acc.evento_id));
end;
$$;
revoke all on function public.estado_sesion(text) from public;
grant execute on function public.estado_sesion(text) to anon, authenticated;

create or replace function public.enviar_inscripcion(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses     uuid;
  v_acc     public.accesos;
  v_ev      public.eventos;
  v_cargador text;
  v_id      uuid;
  v_nro     bigint;
  v_clave   text;
  v_dup     uuid;
  v_creada  timestamptz;
  v_fuera   boolean;
  margen    constant interval := interval '10 minutes';
begin
  if p is null or length(p::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_ses := public.sesion_de_token(p_token);
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'cargar' then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select * into v_ev from public.eventos where id = v_acc.evento_id;
  select nombre into v_cargador from public.colaboradores where id = v_acc.colaborador_id;

  -- D45: «sin cobro» solo en eventos sin conceptos de cobro, y con monto 0.
  if (p->'pago'->>'medio' = 'sin_cobro') is distinct from (jsonb_array_length(coalesce(v_ev.definicion -> 'conceptos', '[]'::jsonb)) = 0)
     or (p->'pago'->>'medio' = 'sin_cobro' and coalesce((p->>'monto')::numeric, -1) <> 0) then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  begin
    v_id := (p->>'id')::uuid;
    v_creada := (p->>'creadaEn')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  select numero_orden into v_nro from public.inscripciones where id = v_id;
  if found then
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  v_fuera := v_creada < v_acc.desde - margen
          or v_creada > least(v_acc.hasta, coalesce(v_acc.cerrado_en, v_acc.hasta)) + margen
          or v_creada > now() + margen
          or v_creada > v_ev.inscripciones_cerradas_en + margen;   -- cargada después de cerrar las inscripciones (D46)
  v_fuera := coalesce(v_fuera, false);

  v_clave := coalesce(
    nullif(regexp_replace(coalesce(p->'datos'->>'dni', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p->'datos'->>'telefono', ''), '\D', '', 'g'), '')
  );
  if v_clave is not null then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_ev.id
      and i.estado <> 'anulada'
      and coalesce(
            nullif(regexp_replace(coalesce(i.datos->>'dni', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(i.datos->>'telefono', ''), '\D', '', 'g'), '')
          ) = v_clave
    order by i.numero_orden
    limit 1;
  end if;

  begin
    insert into public.inscripciones (
      id, evento_id, cargador, dispositivo, creada_en_local, dia_carga, categoria,
      datos, conceptos, monto, medio_pago, banco, ultimos6, estado, duplicado_de,
      sesion_id, fuera_de_horario
    ) values (
      v_id, v_ev.id, v_cargador, p->>'dispositivo', v_creada, (p->>'diaCarga')::date,
      nullif(p->>'categoria', ''),
      coalesce(p->'datos', '{}'::jsonb), coalesce(p->'conceptos', '[]'::jsonb),
      (p->>'monto')::integer, p->'pago'->>'medio',
      nullif(trim(p->'pago'->>'banco'), ''), nullif(p->'pago'->>'ultimos6', ''),
      case when v_dup is null then 'activa' else 'posible_duplicado' end, v_dup,
      v_ses, v_fuera
    )
    on conflict (id) do nothing
    returning numero_orden into v_nro;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  if v_nro is null then
    select numero_orden into v_nro from public.inscripciones where id = v_id;
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', false,
                            'posibleDuplicado', v_dup is not null, 'fueraDeHorario', v_fuera);
end;
$$;
revoke all on function public.enviar_inscripcion(text, jsonb) from public;
grant execute on function public.enviar_inscripcion(text, jsonb) to anon, authenticated;

create or replace function public._crear_acceso(p_evento text, p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_colab  uuid;
  v_codigo text;
  v_id     uuid;
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not exists (select 1 from public.eventos where id = p_evento and estado = 'abierto') then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;
  if p_tarea not in ('cargar', 'presentes') then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  if p_tarea = 'cargar' and exists (select 1 from public.eventos where id = p_evento and inscripciones_cerradas_en is not null) then
    return jsonb_build_object('ok', false, 'error', 'inscripciones_cerradas');
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta <= now()
     or p_hasta - p_desde > interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'horario_invalido');
  end if;

  insert into public.colaboradores (nombre) values (v_nombre)
  on conflict (nombre) do update set nombre = excluded.nombre
  returning id into v_colab;

  loop
    v_codigo := public.nuevo_codigo_corto();
    begin
      insert into public.accesos (evento_id, colaborador_id, tarea, desde, hasta, codigo_hash, creado_por)
      values (p_evento, v_colab, p_tarea, p_desde, p_hasta, public.huella_acceso(v_codigo), coalesce(public.correo_actual(), 'clave de organizador'))
      returning id into v_id;
      exit;
    exception when unique_violation then
    end;
  end loop;

  perform public.auditar('crear_acceso', 'acceso', v_id::text, null,
    jsonb_build_object('evento', p_evento, 'colaborador', v_nombre, 'tarea', p_tarea, 'desde', p_desde, 'hasta', p_hasta));
  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end;
$$;
revoke all on function public._crear_acceso(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public._datos_accesos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'inscripcionesCerradas', e.inscripciones_cerradas_en is not null) order by e.fecha)
      from public.eventos e where e.estado = 'abierto'), '[]'::jsonb),
    'colaboradores', coalesce((select jsonb_agg(c.nombre order by c.nombre) from public.colaboradores c), '[]'::jsonb),
    'accesos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'eventoId', a.evento_id, 'colaborador', c.nombre, 'tarea', a.tarea,
        'desde', a.desde, 'hasta', a.hasta, 'cerradoEn', a.cerrado_en, 'creadoEn', a.creado_en, 'creadoPor', a.creado_por,
        'dispositivos', (select count(*) from public.sesiones s where s.acceso_id = a.id),
        'ultimaConexion', (select max(s.ultima_conexion) from public.sesiones s where s.acceso_id = a.id),
        'inscripciones', (select count(*) from public.inscripciones i
                          join public.sesiones s on s.id = i.sesion_id where s.acceso_id = a.id)
      ) order by a.creado_en desc)
      from public.accesos a join public.colaboradores c on c.id = a.colaborador_id
      where a.hasta > now() - interval '30 days'), '[]'::jsonb));
$$;
revoke all on function public._datos_accesos() from public, anon, authenticated;

create or replace function public.panel_eventos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true, 'eventos', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'estado', e.estado, 'unidad', e.unidad,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb),
      'sinCobro', jsonb_array_length(coalesce(e.definicion -> 'conceptos', '[]'::jsonb)) = 0,
      'inscripcionesCerradasEn', e.inscripciones_cerradas_en, 'inscripcionesCerradasPor', e.inscripciones_cerradas_por
    ) order by e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public;
grant execute on function public.panel_eventos() to authenticated;

create or replace function public.panel_corregir_inscripcion(
  p_id uuid, p_datos jsonb, p_medio text, p_banco text, p_ultimos6 text, p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins public.inscripciones;
  v_ult text := upper(regexp_replace(coalesce(p_ultimos6, ''), '[^A-Za-z0-9]', '', 'g'));
  v_datos jsonb;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select * into v_ins from public.inscripciones where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  if v_ins.estado = 'anulada' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  -- En un evento sin cobro (D45) el medio queda «sin_cobro»; en los demás, uno de los tres.
  if v_ins.medio_pago = 'sin_cobro' then p_medio := 'sin_cobro';
  elsif p_medio not in ('efectivo', 'terminal', 'transferencia') then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if p_medio = 'transferencia' and (coalesce(trim(p_banco), '') = '' or v_ult !~ '^[A-Z0-9]{6}$') then
    return jsonb_build_object('ok', false, 'error', 'transferencia_incompleta');
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or length(p_datos::text) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  -- Solo se cambian campos que ya existen en la inscripción o en el formulario del evento.
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_datos
  from jsonb_each(v_ins.datos || p_datos) as t(k, v)
  where v_ins.datos ? k
     or exists (select 1 from public.eventos e, jsonb_array_elements(e.definicion -> 'campos') c
                where e.id = v_ins.evento_id and c ->> 'id' = k);

  update public.inscripciones set
    datos = v_datos,
    medio_pago = p_medio,
    banco = case when p_medio = 'transferencia' then trim(p_banco) else null end,
    ultimos6 = case when p_medio = 'transferencia' then v_ult else null end
  where id = p_id;

  perform public.auditar('corregir_inscripcion', 'inscripcion', p_id::text,
    jsonb_build_object('datos', v_ins.datos, 'medio', v_ins.medio_pago, 'banco', v_ins.banco, 'ultimos6', v_ins.ultimos6),
    jsonb_build_object('datos', v_datos, 'medio', p_medio,
      'banco', case when p_medio = 'transferencia' then trim(p_banco) end,
      'ultimos6', case when p_medio = 'transferencia' then v_ult end, 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_corregir_inscripcion(uuid, jsonb, text, text, text, text) from public;
grant execute on function public.panel_corregir_inscripcion(uuid, jsonb, text, text, text, text) to authenticated;

select 'Eventos sin cobro y cierre de inscripciones instalados' as resultado;
