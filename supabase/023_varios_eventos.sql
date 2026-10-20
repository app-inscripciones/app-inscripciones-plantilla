-- =====================================================================
-- 023 · Un QR de carga con VARIOS eventos (D77, pedido de Carlos 20/10/2026)
-- El Organizador crea un solo QR para un cargador y tilda los eventos (por ejemplo, campamentos A, B y C).
-- En el celular, antes de cada inscripción se elige el evento; cada inscripción queda en su evento
-- (panel, cupo, Excel y rendiciones por evento, como siempre).
--  · Tabla acceso_eventos: los eventos de cada QR. Todo QR tiene al menos uno (el de accesos.evento_id,
--    que sigue siendo el «principal»). Un disparador la completa sola para los QR de siempre.
--  · No borra ni cambia ningún dato. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.acceso_eventos (
  acceso_id uuid not null references public.accesos (id) on delete cascade,
  evento_id text not null references public.eventos (id),
  primary key (acceso_id, evento_id)
);
create index if not exists acceso_eventos_evento_idx on public.acceso_eventos (evento_id);
alter table public.acceso_eventos enable row level security;
revoke all on public.acceso_eventos from public, anon, authenticated;

insert into public.acceso_eventos (acceso_id, evento_id) select id, evento_id from public.accesos on conflict do nothing;

create or replace function public._acceso_evento_principal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.acceso_eventos (acceso_id, evento_id) values (new.id, new.evento_id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists acceso_evento_principal on public.accesos;
create trigger acceso_evento_principal after insert on public.accesos
  for each row execute function public._acceso_evento_principal();

-- Las definiciones de los eventos de un QR que todavía se pueden usar (formulario, precios, etc.).
create or replace function public._eventos_de_acceso(p_acceso uuid, p_tarea text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(e.definicion || jsonb_build_object('id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'unidad', e.unidad)
                            order by e.fecha, e.nombre), '[]'::jsonb)
  from public.acceso_eventos ae join public.eventos e on e.id = ae.evento_id
  where ae.acceso_id = p_acceso and e.estado = 'abierto' and e.archivado_en is null
    and (p_tarea <> 'cargar' or e.inscripciones_cerradas_en is null);
$$;
revoke all on function public._eventos_de_acceso(uuid, text) from public, anon, authenticated;

-- Crear un QR con varios eventos. Con uno solo es exactamente lo de siempre (_crear_acceso).
-- Varios: solo para cargar, todos abiertos para inscribir, y sin mezclar eventos de práctica con eventos reales.
create or replace function public._crear_acceso_varios(p_eventos text[], p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_lista text[] := array(select distinct x from unnest(coalesce(p_eventos, '{}')) x where x is not null and x <> '');
  v_r jsonb;
  v_ev text;
begin
  if cardinality(v_lista) = 0 or cardinality(v_lista) > 20 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  if cardinality(v_lista) > 1 then
    if p_tarea <> 'cargar' then return jsonb_build_object('ok', false, 'error', 'varios_solo_carga'); end if;
    if (select count(distinct practica) from public.eventos where id = any(v_lista)) > 1 then
      return jsonb_build_object('ok', false, 'error', 'mezcla_practica');
    end if;
    foreach v_ev in array v_lista loop
      if not exists (select 1 from public.eventos where id = v_ev and estado = 'abierto') then
        return jsonb_build_object('ok', false, 'error', 'evento_cerrado'); end if;
      if exists (select 1 from public.eventos where id = v_ev and archivado_en is not null) then
        return jsonb_build_object('ok', false, 'error', 'evento_archivado'); end if;
      if exists (select 1 from public.eventos where id = v_ev and inscripciones_cerradas_en is not null) then
        return jsonb_build_object('ok', false, 'error', 'inscripciones_cerradas'); end if;
    end loop;
  end if;
  -- El principal: el de fecha más cercana.
  select id into v_ev from public.eventos where id = any(v_lista) order by fecha, nombre limit 1;
  v_r := public._crear_acceso(v_ev, p_nombre, p_tarea, p_desde, p_hasta);
  if (v_r ->> 'ok')::boolean then
    insert into public.acceso_eventos (acceso_id, evento_id)
    select (v_r ->> 'id')::uuid, x from unnest(v_lista) x on conflict do nothing;
    if cardinality(v_lista) > 1 then
      perform public.auditar('acceso_varios_eventos', 'acceso', v_r ->> 'id', null, jsonb_build_object('eventos', to_jsonb(v_lista)));
    end if;
  end if;
  return v_r;
end; $$;
revoke all on function public._crear_acceso_varios(text[], text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.panel_crear_acceso_varios(p_eventos text[], p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public._crear_acceso_varios(p_eventos, p_nombre, p_tarea, p_desde, p_hasta);
end; $$;
revoke all on function public.panel_crear_acceso_varios(text[], text, text, timestamptz, timestamptz) from public;
grant execute on function public.panel_crear_acceso_varios(text[], text, text, timestamptz, timestamptz) to authenticated;

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
  -- D77: un QR de carga puede tener varios eventos. Se activa si al menos uno sigue abierto para inscribir;
  -- el «principal» que se devuelve como «evento» (para celulares con la versión anterior) es el primero disponible.
  select e.* into v_ev from public.acceso_eventos ae join public.eventos e on e.id = ae.evento_id
   where ae.acceso_id = v_acc.id and e.estado = 'abierto' and e.archivado_en is null
     and (v_acc.tarea <> 'cargar' or e.inscripciones_cerradas_en is null)
   order by e.fecha, e.nombre limit 1;
  if not found then
    if v_acc.tarea = 'cargar' and exists (select 1 from public.acceso_eventos ae join public.eventos e on e.id = ae.evento_id
                                          where ae.acceso_id = v_acc.id and e.estado = 'abierto' and e.inscripciones_cerradas_en is not null) then
      return jsonb_build_object('ok', false, 'error', 'inscripciones_cerradas');
    end if;
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
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
    'evento', v_ev.definicion || jsonb_build_object('id', v_ev.id, 'nombre', v_ev.nombre, 'fecha', v_ev.fecha, 'unidad', v_ev.unidad),
    'eventos', public._eventos_de_acceso(v_acc.id, v_acc.tarea)
  );
end;
$$;

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
    'inscripcionesCerradasEn', (select inscripciones_cerradas_en from public.eventos where id = v_acc.evento_id),
    'presenciales', (select case when c ->> 'modalidad' = 'hibrido'
                                 then jsonb_build_object('cerradasEn', c -> 'cerradasEn', 'quedan', c -> 'quedan') end
                     from public.estado_cupo(v_acc.evento_id) c),
    -- D77: el estado de cada evento del QR (cierre de inscripciones y lugares presenciales).
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'inscripcionesCerradasEn', e.inscripciones_cerradas_en,
                  'disponible', e.estado = 'abierto' and e.archivado_en is null,
                  'presenciales', (select case when c ->> 'modalidad' = 'hibrido'
                                               then jsonb_build_object('cerradasEn', c -> 'cerradasEn', 'quedan', c -> 'quedan') end
                                   from public.estado_cupo(e.id) c)) order by e.fecha, e.nombre), '[]'::jsonb)
                from public.acceso_eventos ae join public.eventos e on e.id = ae.evento_id where ae.acceso_id = v_acc.id));
end;
$$;

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
  v_claves  text[];
  v_dup     uuid;
  v_creada  timestamptz;
  v_fuera   boolean;
  margen    constant interval := interval '10 minutes';
  v_esperado integer;
begin
  if p is null or length(p::text) > 60000 then
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
  -- D77: la inscripción va al evento elegido en el celular, si es uno de los del QR; si no viene, al principal.
  select e.* into v_ev from public.acceso_eventos ae join public.eventos e on e.id = ae.evento_id
   where ae.acceso_id = v_acc.id and e.id = coalesce(nullif(p->>'eventoId', ''), v_acc.evento_id);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  select nombre into v_cargador from public.colaboradores where id = v_acc.colaborador_id;

  -- D45: «sin cobro» solo en eventos sin conceptos de cobro, y con monto 0.
  if (p->'pago'->>'medio' = 'sin_cobro') is distinct from (jsonb_array_length(coalesce(v_ev.definicion -> 'conceptos', '[]'::jsonb)) = 0)
     or (p->'pago'->>'medio' = 'sin_cobro' and coalesce((p->>'monto')::numeric, -1) <> 0) then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  -- Grupos: la lista de integrantes tiene que existir (entre 1 y 50, cada uno con su id).
  if v_ev.unidad = 'grupo' then
    if coalesce(jsonb_typeof(p -> 'datos' -> 'integrantes'), '') <> 'array'
       or jsonb_array_length(p -> 'datos' -> 'integrantes') not between 1 and 50
       or exists (select 1 from jsonb_array_elements(p -> 'datos' -> 'integrantes') x
                  where coalesce(jsonb_typeof(x), '') <> 'object' or coalesce(x ->> 'id', '') !~ '^i[0-9]{1,3}$')
       or (select count(distinct x ->> 'id') from jsonb_array_elements(p -> 'datos' -> 'integrantes') x) <> jsonb_array_length(p -> 'datos' -> 'integrantes') then
      return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end if;
  end if;

  -- D51: el servidor vuelve a calcular el monto. Si no coincide, se guarda IGUAL, marcada para revisar.
  begin
    v_esperado := public.calcular_monto_inscripcion(v_ev.definicion || jsonb_build_object('unidad', v_ev.unidad),
                    nullif(p->>'categoria', ''), coalesce(p->'datos', '{}'::jsonb), (p->>'diaCarga')::date);
  exception when others then v_esperado := null;
  end;

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
          or v_creada > v_ev.inscripciones_cerradas_en + margen;
  v_fuera := coalesce(v_fuera, false);

  -- Repetidas: algún DNI (de la persona o de cualquier integrante) ya inscripto; sin DNI, el teléfono.
  v_claves := public.claves_inscripcion(coalesce(p->'datos', '{}'::jsonb));
  if cardinality(v_claves) > 0 then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_ev.id
      and i.estado <> 'anulada'
      and public.claves_inscripcion(i.datos) && v_claves
    order by i.numero_orden
    limit 1;
  end if;

  begin
    insert into public.inscripciones (
      id, evento_id, cargador, dispositivo, creada_en_local, dia_carga, categoria,
      datos, conceptos, monto, medio_pago, banco, ultimos6, estado, duplicado_de,
      sesion_id, fuera_de_horario, monto_esperado, monto_revisar
    ) values (
      v_id, v_ev.id, v_cargador, p->>'dispositivo', v_creada, (p->>'diaCarga')::date,
      case when v_ev.unidad = 'grupo' then null else nullif(p->>'categoria', '') end,
      coalesce(p->'datos', '{}'::jsonb), coalesce(p->'conceptos', '[]'::jsonb),
      (p->>'monto')::integer, p->'pago'->>'medio',
      nullif(trim(p->'pago'->>'banco'), ''), nullif(p->'pago'->>'ultimos6', ''),
      case when v_dup is null then 'activa' else 'posible_duplicado' end, v_dup,
      v_ses, v_fuera, v_esperado, v_esperado is distinct from (p->>'monto')::integer
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
                            'posibleDuplicado', v_dup is not null, 'fueraDeHorario', v_fuera,
                            'montoARevisar', v_esperado is distinct from (p->>'monto')::integer);
end;
$$;

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
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'practica', e.practica,
                                          'inscripcionesCerradas', e.inscripciones_cerradas_en is not null) order by e.practica, e.fecha)
      from public.eventos e where e.estado = 'abierto' and e.archivado_en is null), '[]'::jsonb),
    'colaboradores', coalesce((select jsonb_agg(c.nombre order by c.nombre) from public.colaboradores c), '[]'::jsonb),
    'accesos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'eventoId', a.evento_id, 'colaborador', c.nombre, 'tarea', a.tarea,
        'eventoIds', (select jsonb_agg(ae.evento_id order by e2.fecha, e2.nombre) from public.acceso_eventos ae
                      join public.eventos e2 on e2.id = ae.evento_id where ae.acceso_id = a.id),
        'desde', a.desde, 'hasta', a.hasta, 'cerradoEn', a.cerrado_en, 'creadoEn', a.creado_en, 'creadoPor', a.creado_por,
        'dispositivos', (select count(*) from public.sesiones s where s.acceso_id = a.id),
        'ultimaConexion', (select max(s.ultima_conexion) from public.sesiones s where s.acceso_id = a.id),
        'inscripciones', (select count(*) from public.inscripciones i
                          join public.sesiones s on s.id = i.sesion_id where s.acceso_id = a.id)
      ) order by a.creado_en desc)
      from public.accesos a join public.colaboradores c on c.id = a.colaborador_id
      where a.hasta > now() - interval '30 days'), '[]'::jsonb));
$$;

create or replace function public.panel_resumen(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if not exists (select 1 from public.eventos where id = p_evento) then
    return jsonb_build_object('ok', false, 'error', 'evento_inexistente');
  end if;

  with ins as (
    select * from public.inscripciones where evento_id = p_evento and estado <> 'anulada'
  ),
  cats as (
    -- Una fila por persona con categoría: la de la inscripción o, en los grupos, la de cada integrante.
    select coalesce(categoria, '') as categoria from ins where jsonb_typeof(datos -> 'integrantes') is distinct from 'array'
    union all
    select coalesce(x ->> 'categoria', '') from ins, jsonb_array_elements(datos -> 'integrantes') x where jsonb_typeof(datos -> 'integrantes') = 'array'
  ),
  cargadores as (
    select cargador from ins
    union select cargador from public.rendiciones where evento_id = p_evento and not anulada
  ),
  por_cargador as (
    select c.cargador,
      (select count(*) from ins i where i.cargador = c.cargador) as inscripciones,
      (select coalesce(sum(personas), 0) from ins i where i.cargador = c.cargador) as personas,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador) as total,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'efectivo') as efectivo,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'terminal') as terminal,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'transferencia') as transferencia,
      (select coalesce(sum(monto), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as rendido,
      (select count(*) from ins i where i.cargador = c.cargador and medio_pago = 'terminal') as tickets_terminal,
      (select coalesce(sum(tickets), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as tickets_rendidos,
      (select max(s.ultima_conexion) from public.sesiones s join public.accesos a on a.id = s.acceso_id
         join public.colaboradores co on co.id = a.colaborador_id
         where co.nombre = c.cargador
           and exists (select 1 from public.acceso_eventos ae where ae.acceso_id = a.id and ae.evento_id = p_evento)) as ultima_conexion
    from cargadores c
  )
  select jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'inscriptos', (select count(*) from ins),
    'personas', (select coalesce(sum(personas), 0) from ins),
    'anuladas', (select count(*) from public.inscripciones where evento_id = p_evento and estado = 'anulada'),
    'posiblesDuplicados', (select count(*) from ins where estado = 'posible_duplicado'),
    'fueraDeHorario', (select count(*) from ins where fuera_de_horario),
    'montoARevisar', (select count(*) from ins where monto_revisar),
    'sobreCupo', (select count(*) from ins where sobre_cupo),
    'paraRevisar', (select count(*) from ins where estado = 'posible_duplicado' or fuera_de_horario or monto_revisar or sobre_cupo),
    'modalidad', public.estado_cupo(p_evento),
    'dinero', jsonb_build_object(
      'total', (select coalesce(sum(monto), 0) from ins),
      'efectivo', (select coalesce(sum(monto), 0) from ins where medio_pago = 'efectivo'),
      'terminal', (select coalesce(sum(monto), 0) from ins where medio_pago = 'terminal'),
      'transferencia', (select coalesce(sum(monto), 0) from ins where medio_pago = 'transferencia'),
      'rendido', (select coalesce(sum(monto), 0) from public.rendiciones where evento_id = p_evento and not anulada),
      'ticketsTerminal', (select count(*) from ins where medio_pago = 'terminal'),
      'ticketsRendidos', (select coalesce(sum(tickets), 0) from public.rendiciones where evento_id = p_evento and not anulada)
    ),
    'porCargador', coalesce((select jsonb_agg(jsonb_build_object(
        'cargador', cargador, 'inscripciones', inscripciones, 'personas', personas, 'total', total, 'efectivo', efectivo,
        'terminal', terminal, 'transferencia', transferencia, 'rendido', rendido,
        'aRendir', efectivo - rendido, 'ultimaConexion', ultima_conexion,
        'ticketsTerminal', tickets_terminal, 'ticketsRendidos', tickets_rendidos, 'ticketsPendientes', tickets_terminal - tickets_rendidos
      ) order by cargador) from por_cargador), '[]'::jsonb),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'cantidad', n) order by categoria)
        from (select categoria, count(*) as n from cats group by 1) x), '[]'::jsonb),
    'porDia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia_carga, 'cantidad', n, 'personas', p) order by dia_carga)
        from (select dia_carga, count(*) as n, sum(personas) as p from ins group by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

create or replace function public.enviar_inscripcion_y_presente(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := public.enviar_inscripcion(p_token, p - 'presente');
  v_ses uuid;
  v_acc public.accesos;
  v_nombre text;
  v_cfg jsonb;
  v_personas text[];
  v_per text;
  v_base uuid;
  v_evento text;
begin
  if (r ->> 'ok')::boolean and p ? 'presente' and jsonb_typeof(p -> 'presente') = 'object' then
    v_ses := public.sesion_de_token(p_token);
    select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
    select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;
    -- D77: el evento de la inscripción (puede ser cualquiera de los del QR).
    select evento_id into v_evento from public.inscripciones where id = (p ->> 'id')::uuid;
    v_evento := coalesce(v_evento, v_acc.evento_id);
    v_cfg := public.config_asistencia(v_evento);
    begin
      v_base := (p -> 'presente' ->> 'id')::uuid;
      if v_cfg ->> 'modoPareja' = 'individual' then
        if v_cfg ->> 'unidad' = 'grupo' then
          select array_agg(x ->> 'id') into v_personas
            from public.inscripciones i, jsonb_array_elements(i.datos -> 'integrantes') x where i.id = (p ->> 'id')::uuid;
        else
          v_personas := array['hombre', 'mujer'];
        end if;
        foreach v_per in array coalesce(v_personas, '{}'::text[]) loop
          perform public._marcar(md5(v_base::text || v_per)::uuid, v_evento, (p ->> 'id')::uuid,
                                 p -> 'presente' ->> 'instancia', v_per, (p ->> 'creadaEn')::timestamptz, v_nombre, v_ses);
        end loop;
      else
        perform public._marcar(v_base, v_evento, (p ->> 'id')::uuid,
                               p -> 'presente' ->> 'instancia', '', (p ->> 'creadaEn')::timestamptz, v_nombre, v_ses);
      end if;
    exception when others then
      null; -- la inscripción ya quedó guardada; la marca se puede hacer en la puerta
    end;
  end if;
  return r;
end;
$$;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 23 $$;
revoke all on function public.version_base() from public, anon, authenticated;
