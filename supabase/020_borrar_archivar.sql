-- =====================================================================
-- Nombres sin repetir, borrar y archivar eventos (D63 y D65)
--  · Nombres: no se puede abrir un evento con el mismo nombre que otro evento que esté a la vista
--    (abierto o cerrado, sin archivar; sin contar mayúsculas, acentos ni espacios de más).
--  · Borrar: solo un evento SIN datos (ninguna inscripción, presente ni rendición, aunque estén anuladas).
--    Hay que escribir el nombre del evento para confirmar. Se borran también sus QR. Queda en la auditoría.
--  · Archivar: para eventos con datos. Desaparece del panel y de los QR; NO se borra nada.
--      - No se puede archivar si queda efectivo o tickets de la terminal pendientes de rendir.
--      - Si el evento todavía no terminó, hay que escribir el nombre para confirmar.
--      - Al archivar se cierran las inscripciones y los QR (de cargador, de puerta y de autopresente).
--        Lo que llegue después de un celular sin internet se recibe igual, marcado «fuera de horario» (D38).
--      - Se puede volver a mostrar (las inscripciones siguen cerradas; se reabren con su botón).
-- Lo hace el Organizador. Se ejecuta después de 001 a 019. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.eventos add column if not exists archivado_en timestamptz;
alter table public.eventos add column if not exists archivado_por text;

-- «Jornada  de Prueba» = «jornada de prueba» = «Jornada de prueba» (sin acentos ni espacios de más).
create or replace function public.nombre_normal(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(translate(trim(coalesce(p, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g')
$$;
revoke all on function public.nombre_normal(text) from public, anon, authenticated;

-- Otro evento a la vista con el mismo nombre (null si no hay).
create or replace function public.evento_mismo_nombre(p_nombre text, p_excepto text)
returns public.eventos
language sql
stable
security definer
set search_path = public
as $$
  select e.* from public.eventos e
   where e.id <> coalesce(p_excepto, '') and e.estado <> 'borrador' and e.archivado_en is null and not e.es_modelo
     and public.nombre_normal(e.nombre) = public.nombre_normal(p_nombre)
   order by e.fecha desc limit 1
$$;
revoke all on function public.evento_mismo_nombre(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Abrir el evento (igual a la versión de 009, más el control del nombre repetido)
-- ---------------------------------------------------------------------
create or replace function public.panel_abrir_evento(p_id text, p_definicion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_otro public.eventos;
  v_problema text;
  v_id text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_ev.estado <> 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_ya_abierto'); end if;
  v_problema := public.problema_definicion(p_definicion);
  if v_problema is null and (p_definicion ->> 'fecha')::date < current_date - 1 then v_problema := 'la fecha ya pasó'; end if;
  if v_problema is null then
    v_otro := public.evento_mismo_nombre(p_definicion ->> 'nombre', p_id);
    if v_otro.id is not null then v_problema := 'ya hay otro evento con ese nombre'; end if;
  end if;
  if v_problema is not null then
    return jsonb_build_object('ok', false, 'error', 'definicion_invalida', 'detalle', v_problema);
  end if;
  v_id := public.nuevo_id_evento(trim(p_definicion ->> 'nombre'), (p_definicion ->> 'fecha')::date, p_id);
  if v_id <> p_id then
    update public.eventos set id = v_id where id = p_id;
  end if;
  update public.eventos
     set nombre = trim(p_definicion ->> 'nombre'), fecha = (p_definicion ->> 'fecha')::date, unidad = p_definicion ->> 'unidad',
         definicion = p_definicion, estado = 'abierto',
         abierto_en = now(), abierto_por = public.correo_actual(), actualizado_en = now()
   where id = v_id;
  perform public.auditar('abrir_evento', 'evento', v_id, jsonb_build_object('borrador', p_id), p_definicion);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.panel_abrir_evento(text, jsonb) from public;
grant execute on function public.panel_abrir_evento(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Cuánto falta rendir en un evento (efectivo y tickets), sumando solo lo que falta de cada cargador.
-- ---------------------------------------------------------------------
create or replace function public.pendiente_de_rendir(p_evento text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select cargador from public.inscripciones where evento_id = p_evento and estado <> 'anulada'
    union select cargador from public.rendiciones where evento_id = p_evento and not anulada
  ), x as (
    select c.cargador,
      (select coalesce(sum(monto), 0) from public.inscripciones i where i.evento_id = p_evento and i.cargador = c.cargador and i.estado <> 'anulada' and i.medio_pago = 'efectivo')
      - (select coalesce(sum(monto), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as efectivo,
      (select count(*) from public.inscripciones i where i.evento_id = p_evento and i.cargador = c.cargador and i.estado <> 'anulada' and i.medio_pago = 'terminal')
      - (select coalesce(sum(tickets), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as tickets
    from c
  )
  select jsonb_build_object('efectivo', coalesce(sum(greatest(efectivo, 0)), 0), 'tickets', coalesce(sum(greatest(tickets, 0)), 0)) from x
$$;
revoke all on function public.pendiente_de_rendir(text) from public, anon, authenticated;

-- Lo que el panel necesita para ofrecer «Borrar» o «Archivar».
create or replace function public.panel_estado_borrado(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_evento;
  if not found or v_ev.estado = 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  return jsonb_build_object('ok', true,
    'nombre', v_ev.nombre,
    'inscripciones', (select count(*) from public.inscripciones where evento_id = p_evento),
    'presentes', (select count(*) from public.asistencias where evento_id = p_evento),
    'rendiciones', (select count(*) from public.rendiciones where evento_id = p_evento),
    'pendiente', public.pendiente_de_rendir(p_evento),
    'terminado', coalesce(nullif(v_ev.definicion ->> 'fechaFin', '')::date, v_ev.fecha) < current_date,
    'archivadoEn', v_ev.archivado_en, 'archivadoPor', v_ev.archivado_por,
    'practica', v_ev.practica);
end;
$$;
revoke all on function public.panel_estado_borrado(text) from public, anon;
grant execute on function public.panel_estado_borrado(text) to authenticated;

-- ---------------------------------------------------------------------
-- Borrar un evento sin datos
-- ---------------------------------------------------------------------
create or replace function public.panel_borrar_evento(p_evento text, p_confirmacion text)
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
  if not found or v_ev.estado = 'borrador' or v_ev.es_modelo then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if public.nombre_normal(p_confirmacion) <> public.nombre_normal(v_ev.nombre) then
    return jsonb_build_object('ok', false, 'error', 'confirmacion_incorrecta');
  end if;
  -- Bloqueo de las inscripciones del evento: una que esté llegando justo ahora espera y se cuenta.
  perform 1 from public.inscripciones where evento_id = p_evento for update;
  if exists (select 1 from public.inscripciones where evento_id = p_evento)
     or exists (select 1 from public.asistencias where evento_id = p_evento)
     or exists (select 1 from public.rendiciones where evento_id = p_evento) then
    return jsonb_build_object('ok', false, 'error', 'evento_con_datos');
  end if;
  delete from public.autopresentes where evento_id = p_evento;
  delete from public.sesiones where acceso_id in (select id from public.accesos where evento_id = p_evento);
  delete from public.accesos where evento_id = p_evento;
  delete from public.eventos where id = p_evento;
  perform public.auditar('borrar_evento', 'evento', p_evento,
    jsonb_build_object('nombre', v_ev.nombre, 'fecha', v_ev.fecha, 'definicion', v_ev.definicion), null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_borrar_evento(text, text) from public, anon;
grant execute on function public.panel_borrar_evento(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Archivar (p_archivar = true) o volver a mostrar (false)
-- ---------------------------------------------------------------------
create or replace function public.panel_archivar_evento(p_evento text, p_archivar boolean, p_confirmacion text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_pend jsonb;
  v_terminado boolean;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_evento for update;
  if not found or v_ev.estado = 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;

  if not coalesce(p_archivar, true) then
    if v_ev.archivado_en is null then return jsonb_build_object('ok', false, 'error', 'no_archivado'); end if;
    update public.eventos set archivado_en = null, archivado_por = null, actualizado_en = now() where id = p_evento;
    perform public.auditar('desarchivar_evento', 'evento', p_evento, jsonb_build_object('archivadoEn', v_ev.archivado_en), null);
    return jsonb_build_object('ok', true);
  end if;

  if v_ev.archivado_en is not null then return jsonb_build_object('ok', false, 'error', 'evento_archivado'); end if;
  v_pend := public.pendiente_de_rendir(p_evento);
  if (v_pend ->> 'efectivo')::bigint > 0 or (v_pend ->> 'tickets')::bigint > 0 then
    return jsonb_build_object('ok', false, 'error', 'pendiente_rendir', 'pendiente', v_pend);
  end if;
  v_terminado := coalesce(nullif(v_ev.definicion ->> 'fechaFin', '')::date, v_ev.fecha) < current_date;
  if not v_terminado and public.nombre_normal(p_confirmacion) <> public.nombre_normal(v_ev.nombre) then
    return jsonb_build_object('ok', false, 'error', 'confirmacion_incorrecta');
  end if;

  update public.eventos
     set archivado_en = now(), archivado_por = public.correo_actual(), actualizado_en = now(),
         inscripciones_cerradas_en = coalesce(inscripciones_cerradas_en, now()),
         inscripciones_cerradas_por = coalesce(inscripciones_cerradas_por, public.correo_actual())
   where id = p_evento;
  update public.accesos set cerrado_en = now() where evento_id = p_evento and cerrado_en is null and hasta > now();
  update public.autopresentes set cerrado_en = now(), cerrado_por = public.correo_actual() where evento_id = p_evento and cerrado_en is null;
  perform public.auditar('archivar_evento', 'evento', p_evento, null,
    jsonb_build_object('nombre', v_ev.nombre, 'terminado', v_terminado));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_archivar_evento(text, boolean, text) from public, anon;
grant execute on function public.panel_archivar_evento(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Nadie crea QR para un evento archivado
-- ---------------------------------------------------------------------
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
  if exists (select 1 from public.eventos where id = p_evento and archivado_en is not null) then
    return jsonb_build_object('ok', false, 'error', 'evento_archivado');
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

create or replace function public.panel_crear_autopresente(p_evento text, p_instancia text, p_modo text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_codigo text;
  v_id uuid;
  v_pantalla text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if v_cfg is null or not exists (select 1 from public.eventos where id = p_evento and estado <> 'borrador') then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if exists (select 1 from public.eventos where id = p_evento and archivado_en is not null) then
    return jsonb_build_object('ok', false, 'error', 'evento_archivado');
  end if;
  if not (coalesce((v_cfg ->> 'autopresente')::boolean, false) and coalesce((v_cfg ->> 'toma')::boolean, true)) then
    return jsonb_build_object('ok', false, 'error', 'autopresente_no_habilitado');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_cfg -> 'instancias') i where i ->> 'id' = p_instancia) then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if coalesce(p_modo, '') not in ('impreso', 'pantalla') then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta < now() or p_hasta - p_desde > interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'horario_invalido');
  end if;
  loop
    v_codigo := (select string_agg(substr('bcdfghjkmnpqrstvwxz23456789', 1 + (get_byte(b, k) % 27), 1), '' order by k)
                   from (select extensions.gen_random_bytes(12) as b) x, generate_series(0, 11) k);
    exit when not exists (select 1 from public.autopresentes where codigo = v_codigo);
  end loop;
  v_pantalla := case when p_modo = 'pantalla' then encode(extensions.gen_random_bytes(24), 'hex') end;
  insert into public.autopresentes (evento_id, instancia, modo, codigo, pantalla, secreto, desde, hasta, creado_por)
  values (p_evento, p_instancia, p_modo, v_codigo, v_pantalla, encode(extensions.gen_random_bytes(24), 'hex'), p_desde, p_hasta, public.correo_actual())
  returning id into v_id;
  perform public.auditar('crear_autopresente', 'evento', p_evento, null,
    jsonb_build_object('id', v_id, 'instancia', p_instancia, 'modo', p_modo, 'desde', p_desde, 'hasta', p_hasta));
  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'pantalla', v_pantalla);
end;
$$;
revoke all on function public.panel_crear_autopresente(text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.panel_crear_autopresente(text, text, text, timestamptz, timestamptz) to authenticated;

-- QR de colaboradores: solo eventos sin archivar (igual a la versión de 014, más ese filtro).
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

-- Crear eventos: los eventos para copiar y comparar el nombre llevan si están archivados.
create or replace function public.panel_borradores()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true,
    'borradores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'actualizadoEn', e.actualizado_en, 'creadoPor', e.creado_por,
        'borrador', e.definicion) order by e.actualizado_en desc)
      from public.eventos e where e.estado = 'borrador'), '[]'::jsonb),
    'copiables', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'esModelo', e.es_modelo, 'estado', e.estado,
        'archivadoEn', e.archivado_en,
        'definicion', e.definicion || jsonb_build_object('unidad', e.unidad)) order by e.es_modelo desc, e.fecha desc)
      from public.eventos e where e.estado <> 'borrador' and not e.practica), '[]'::jsonb),
    'practicas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha,
        'hasta', coalesce(nullif(e.definicion ->> 'fechaFin', '')::date, e.fecha)) order by e.fecha desc)
      from public.eventos e where e.practica), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_borradores() from public, anon;
grant execute on function public.panel_borradores() to authenticated;

-- Panel: la lista de eventos lleva si están archivados (igual a la versión de 018, más ese dato).
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
      'fechaFin', nullif(e.definicion ->> 'fechaFin', ''),
      'archivadoEn', e.archivado_en, 'archivadoPor', e.archivado_por,
      'grupo', e.definicion -> 'grupo',
      'practica', e.practica,
      'modalidad', coalesce(e.definicion ->> 'modalidad', 'presencial'),
      'cupoPresencial', coalesce(e.cupo_presencial, (e.definicion ->> 'cupoPresencial')::integer),
      'cierrePresencialPct', case when e.cierre_presencial_pct = 0 then null else coalesce(e.cierre_presencial_pct, (e.definicion ->> 'cierrePresencialPct')::integer) end,
      'presencialesCerradasEn', e.presenciales_cerradas_en, 'presencialesCerradasPor', e.presenciales_cerradas_por,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb),
      'conceptos', coalesce(e.definicion -> 'conceptos', '[]'::jsonb),
      'sinCobro', jsonb_array_length(coalesce(e.definicion -> 'conceptos', '[]'::jsonb)) = 0,
      'inscripcionesCerradasEn', e.inscripciones_cerradas_en, 'inscripcionesCerradasPor', e.inscripciones_cerradas_por
    ) order by e.practica, e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public, anon;
grant execute on function public.panel_eventos() to authenticated;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 20 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Borrar y archivar eventos instalado' as resultado, public.version_base() as version;
