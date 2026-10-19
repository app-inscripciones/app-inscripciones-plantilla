-- =====================================================================
-- Etapa 4B · Control de presentes en la puerta (R15, D28 a D32)
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run),
-- después de 001 a 006 (y de volver a ejecutar 002 para que los eventos
-- modelo tengan su configuración de asistencia). Se puede volver a ejecutar.
--
--  · La configuración de asistencia está en eventos.definicion -> 'asistencia':
--    { toma, modoPareja ('pareja'|'individual'), instancias:[{id,nombre,fecha,turno}],
--      camposBusqueda:[...], campoProcedencia }
--  · asistencias: cada marca de «Presente» (la crea el celular, con su id).
--    Una sola marca vigente por inscripción + instancia (+ persona si se marca por separado).
--    Si dos celulares marcan a la misma persona, vale la hora más temprana.
-- =====================================================================

create table if not exists public.asistencias (
  id             uuid primary key,
  evento_id      text not null references public.eventos (id),
  inscripcion_id uuid not null references public.inscripciones (id),
  instancia      text not null check (length(instancia) between 1 and 60),
  persona        text not null default '' check (persona in ('', 'hombre', 'mujer')),
  marcada_en     timestamptz not null,
  marcado_por    text not null,
  sesion_id      uuid references public.sesiones (id),
  estado         text not null default 'presente' check (estado in ('presente', 'deshecha')),
  recibida_en    timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create unique index if not exists asistencias_vigente_idx
  on public.asistencias (inscripcion_id, instancia, persona) where estado = 'presente';
create index if not exists asistencias_evento_idx on public.asistencias (evento_id, actualizada_en);
alter table public.asistencias enable row level security;
revoke all on public.asistencias from anon, authenticated;

-- Para que los celulares de la puerta reciban solo lo que cambió.
alter table public.inscripciones add column if not exists actualizada_en timestamptz not null default now();
create index if not exists inscripciones_actualizada_idx on public.inscripciones (evento_id, actualizada_en);
create or replace function public.tocar_actualizada_en() returns trigger language plpgsql as $$
begin new.actualizada_en := now(); return new; end; $$;
drop trigger if exists inscripciones_tocar on public.inscripciones;
create trigger inscripciones_tocar before update on public.inscripciones
  for each row execute function public.tocar_actualizada_en();
drop trigger if exists asistencias_tocar on public.asistencias;
create trigger asistencias_tocar before update on public.asistencias
  for each row execute function public.tocar_actualizada_en();

-- Configuración de asistencia de un evento (con valores por defecto si no tiene).
create or replace function public.config_asistencia(p_evento text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(e.definicion -> 'asistencia', '{}'::jsonb)
    || jsonb_build_object(
      'toma', coalesce((e.definicion -> 'asistencia' ->> 'toma')::boolean, true),
      'modoPareja', case when e.unidad = 'pareja' then coalesce(e.definicion -> 'asistencia' ->> 'modoPareja', 'pareja') end,
      'instancias', coalesce(nullif(e.definicion -> 'asistencia' -> 'instancias', '[]'::jsonb),
                             jsonb_build_array(jsonb_build_object('id', 'llegada', 'nombre', 'Llegada', 'fecha', e.fecha))))
  from public.eventos e where e.id = p_evento;
$$;
revoke all on function public.config_asistencia(text) from public, anon, authenticated;

-- Registra (o actualiza) una marca. Uso interno: celulares de la puerta, cargador con «Ya está presente» y panel.
create or replace function public._marcar(p_id uuid, p_evento text, p_inscripcion uuid, p_instancia text, p_persona text,
                                         p_marcada_en timestamptz, p_por text, p_sesion uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_existente public.asistencias;
  v_persona text := coalesce(p_persona, '');
begin
  if not exists (select 1 from public.inscripciones where id = p_inscripcion and evento_id = p_evento and estado <> 'anulada') then
    return 'inscripcion_invalida';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_cfg -> 'instancias') i where i ->> 'id' = p_instancia) then
    return 'instancia_invalida';
  end if;
  if v_cfg ->> 'modoPareja' = 'individual' then
    if v_persona not in ('hombre', 'mujer') then return 'datos_invalidos'; end if;
  else
    v_persona := '';
  end if;

  -- La misma marca que llega dos veces: no se repite.
  if exists (select 1 from public.asistencias where id = p_id) then return 'repetida'; end if;

  select * into v_existente from public.asistencias
   where inscripcion_id = p_inscripcion and instancia = p_instancia and persona = v_persona and estado = 'presente';
  if found then
    -- Ya estaba presente: vale la hora más temprana.
    if p_marcada_en < v_existente.marcada_en then
      update public.asistencias set estado = 'deshecha' where id = v_existente.id;
      insert into public.asistencias (id, evento_id, inscripcion_id, instancia, persona, marcada_en, marcado_por, sesion_id)
      values (p_id, p_evento, p_inscripcion, p_instancia, v_persona, p_marcada_en, p_por, p_sesion);
    end if;
    return 'ya_presente';
  end if;
  begin
    insert into public.asistencias (id, evento_id, inscripcion_id, instancia, persona, marcada_en, marcado_por, sesion_id)
    values (p_id, p_evento, p_inscripcion, p_instancia, v_persona, p_marcada_en, p_por, p_sesion);
  exception when unique_violation then
    return 'ya_presente';  -- otro celular la marcó en el mismo instante
  end;
  return 'ok';
end;
$$;
revoke all on function public._marcar(uuid, text, uuid, text, text, timestamptz, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- PUERTA · lista para el celular (todo, o solo lo que cambió desde p_desde)
-- Solo los datos necesarios para reconocer a la persona (D28).
-- ---------------------------------------------------------------------
create or replace function public.lista_puerta(p_token text, p_desde timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
  v_cfg jsonb;
  v_busq text[];
  v_proc text;
begin
  if v_ses is null then return jsonb_build_object('ok', false, 'error', 'sesion_invalida'); end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'presentes' then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  v_cfg := public.config_asistencia(v_acc.evento_id);
  v_busq := coalesce((select array_agg(x) from jsonb_array_elements_text(v_cfg -> 'camposBusqueda') x), array['nombre', 'dni', 'hombre', 'mujer']);
  v_proc := v_cfg ->> 'campoProcedencia';

  return jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'asistencia', v_cfg,
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'n', i.numero_orden,
        'datos', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each_text(i.datos) as t(k, v) where k = any(v_busq)),
        'categoria', i.categoria,
        'procedencia', case when v_proc is not null then i.datos ->> v_proc end,
        'anulada', i.estado = 'anulada'))
      from public.inscripciones i
      where i.evento_id = v_acc.evento_id and (p_desde is null or i.actualizada_en > p_desde - interval '5 seconds')), '[]'::jsonb),
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'inscripcionId', m.inscripcion_id, 'instancia', m.instancia, 'persona', m.persona,
        'marcadaEn', m.marcada_en, 'marcadoPor', m.marcado_por, 'estado', m.estado))
      from public.asistencias m
      where m.evento_id = v_acc.evento_id and (p_desde is null or m.actualizada_en > p_desde - interval '5 seconds')
        and (p_desde is not null or m.estado = 'presente')), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.lista_puerta(text, timestamptz) from public;
grant execute on function public.lista_puerta(text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------
-- PUERTA · envío de marcas (varias juntas). Cada marca: {id, inscripcionId, instancia, persona, marcadaEn, estado}
-- estado 'deshecha' = el colaborador tocó «Deshacer» (solo puede deshacer las suyas).
-- Se aceptan después del horario (modo solo envío), igual que las inscripciones.
-- ---------------------------------------------------------------------
create or replace function public.enviar_marcas(p_token text, p_marcas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
  v_nombre text;
  m jsonb;
  r text;
  res jsonb := '[]'::jsonb;
begin
  if v_ses is null then return jsonb_build_object('ok', false, 'error', 'sesion_invalida'); end if;
  if p_marcas is null or jsonb_typeof(p_marcas) <> 'array' or jsonb_array_length(p_marcas) > 500 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'presentes' then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;
  update public.sesiones set ultima_conexion = now() where id = v_ses;

  for m in select * from jsonb_array_elements(p_marcas) loop
    begin
      if m ->> 'estado' = 'deshecha' then
        update public.asistencias set estado = 'deshecha'
         where id = (m ->> 'id')::uuid and sesion_id = v_ses and estado = 'presente';
        r := 'ok';
      else
        r := public._marcar((m ->> 'id')::uuid, v_acc.evento_id, (m ->> 'inscripcionId')::uuid, m ->> 'instancia',
                            m ->> 'persona', least((m ->> 'marcadaEn')::timestamptz, now() + interval '10 minutes'), v_nombre, v_ses);
      end if;
    exception when others then
      r := 'datos_invalidos';
    end;
    res := res || jsonb_build_array(jsonb_build_object('id', m ->> 'id', 'resultado', r));
  end loop;
  return jsonb_build_object('ok', true, 'resultados', res);
end;
$$;
revoke all on function public.enviar_marcas(text, jsonb) from public;
grant execute on function public.enviar_marcas(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Cargador: «Ya está presente» al inscribir el día del evento (D31).
-- La inscripción llega con presente: {id, instancia}. Se registra con el nombre del cargador.
-- ---------------------------------------------------------------------
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
begin
  if (r ->> 'ok')::boolean and p ? 'presente' and jsonb_typeof(p -> 'presente') = 'object' then
    v_ses := public.sesion_de_token(p_token);
    select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
    select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;
    begin
      perform public._marcar((p -> 'presente' ->> 'id')::uuid, v_acc.evento_id, (p ->> 'id')::uuid,
                             p -> 'presente' ->> 'instancia', '', (p ->> 'creadaEn')::timestamptz, v_nombre, v_ses);
    exception when others then
      null; -- la inscripción ya quedó guardada; la marca se puede hacer en la puerta
    end;
  end if;
  return r;
end;
$$;
revoke all on function public.enviar_inscripcion_y_presente(text, jsonb) from public;
grant execute on function public.enviar_inscripcion_y_presente(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- PANEL · presentes del evento (todos los roles del panel)
-- ---------------------------------------------------------------------
create or replace function public.panel_presentes(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_por_persona boolean := v_cfg ->> 'modoPareja' = 'individual';
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object(
    'ok', true,
    'asistencia', v_cfg,
    'esperados', (select count(*) * (case when v_por_persona then 2 else 1 end) from public.inscripciones where evento_id = p_evento and estado <> 'anulada'),
    'porInstancia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', inst ->> 'id', 'nombre', inst ->> 'nombre', 'fecha', inst ->> 'fecha',
        'presentes', (select count(*) from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
                       where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'),
        'porCategoria', coalesce((select jsonb_object_agg(coalesce(cat, ''), n) from (
            select i.categoria as cat, count(*) as n from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
            where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'
            group by i.categoria) x), '{}'::jsonb),
        'ausentes', coalesce((select jsonb_agg(jsonb_build_object('n', i.numero_orden,
              'nombre', coalesce(i.datos ->> 'nombre', concat_ws(' y ', i.datos ->> 'hombre', i.datos ->> 'mujer')),
              'categoria', i.categoria, 'telefono', i.datos ->> 'telefono') order by i.numero_orden)
            from public.inscripciones i
            where i.evento_id = p_evento and i.estado <> 'anulada'
              and not exists (select 1 from public.asistencias a where a.inscripcion_id = i.id and a.instancia = inst ->> 'id' and a.estado = 'presente')), '[]'::jsonb)
      ))
      from jsonb_array_elements(v_cfg -> 'instancias') inst), '[]'::jsonb),
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'inscripcionId', a.inscripcion_id, 'instancia', a.instancia, 'persona', a.persona,
                                          'marcadaEn', a.marcada_en, 'marcadoPor', a.marcado_por))
      from public.asistencias a where a.evento_id = p_evento and a.estado = 'presente'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.panel_presentes(text) from public;
grant execute on function public.panel_presentes(text) to authenticated;

-- Organizador: quitar una marca de presente equivocada (queda en la auditoría).
create or replace function public.panel_quitar_presente(p_marca uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select to_jsonb(a) into v_antes from public.asistencias a where id = p_marca and estado = 'presente';
  if v_antes is null then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  update public.asistencias set estado = 'deshecha' where id = p_marca;
  perform public.auditar('quitar_presente', 'inscripcion', v_antes ->> 'inscripcion_id', v_antes,
                         jsonb_build_object('estado', 'deshecha', 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_quitar_presente(uuid, text) from public;
grant execute on function public.panel_quitar_presente(uuid, text) to authenticated;

-- El Excel suma las marcas de presente.
create or replace function public.panel_exportar(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  perform 1 from public.eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  return jsonb_build_object(
    'ok', true,
    'generado', now(),
    'resumen', public.panel_resumen(p_evento),
    'rendiciones', public.panel_rendiciones(p_evento) -> 'rendiciones',
    'presentes', public.panel_presentes(p_evento),
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'numeroOrden', i.numero_orden, 'creadaEn', i.creada_en_local, 'recibidaEn', i.recibida_en, 'cargador', i.cargador,
        'categoria', i.categoria, 'datos', i.datos, 'conceptos', i.conceptos, 'monto', i.monto, 'medioPago', i.medio_pago,
        'banco', i.banco, 'ultimos6', i.ultimos6, 'estado', i.estado, 'fueraDeHorario', i.fuera_de_horario,
        'anuladaMotivo', i.anulada_motivo,
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) order by i.numero_orden)
      from public.inscripciones i where i.evento_id = p_evento), '[]'::jsonb)
  );
end;
$$;

select 'Etapa 4B instalada' as resultado;
