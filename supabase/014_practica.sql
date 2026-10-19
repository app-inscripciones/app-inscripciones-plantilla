-- =====================================================================
-- Etapa 9 · Evento de práctica (D56)
-- Para capacitar a los voluntarios sin tocar datos reales: un evento marcado «práctica»
-- funciona igual que uno real (QR, carga sin internet, puerta, rendiciones), pero
--  · no se mezcla con los eventos reales (no se copia, no cuenta como «primer evento»),
--  · se ve marcado 🧪 en el panel, en el Excel y en los celulares,
--  · dura una semana y después se borra solo, con todo lo que se cargó (limpiar_practicas,
--    que corre todos los días con el respaldo diario y cada vez que se crea una práctica).
-- Se ejecuta después de 001 a 013. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.eventos add column if not exists practica boolean not null default false;

-- ---------------------------------------------------------------------
-- Borrar las prácticas vencidas (terminaron hace más de un día), con todo lo cargado.
-- Devuelve cuántos eventos borró. No toca nunca un evento real.
-- ---------------------------------------------------------------------
create or replace function public.limpiar_practicas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.eventos
  where practica
    and coalesce(nullif(definicion ->> 'fechaFin', '')::date, fecha) < current_date - 1;
  if cardinality(v_ids) = 0 then return 0; end if;

  delete from public.asistencias where evento_id = any(v_ids);
  update public.inscripciones set duplicado_de = null where evento_id = any(v_ids);
  delete from public.inscripciones where evento_id = any(v_ids);
  delete from public.rendiciones where evento_id = any(v_ids);
  delete from public.sesiones where acceso_id in (select id from public.accesos where evento_id = any(v_ids));
  delete from public.accesos where evento_id = any(v_ids);
  delete from public.eventos where id = any(v_ids) and practica;
  insert into public.auditoria (quien, accion, entidad, entidad_id, despues)
  values ('sistema', 'borrar_practicas', 'evento', array_to_string(v_ids, ', '), to_jsonb(v_ids));
  return cardinality(v_ids);
end;
$$;
revoke all on function public.limpiar_practicas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Crear (y abrir) un evento de práctica. La definición la arma la app (src/logica/practica.js)
-- y pasa por los mismos controles que un evento real.
-- ---------------------------------------------------------------------
create or replace function public.panel_crear_practica(p_definicion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problema text;
  v_id text;
  v_fecha date;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  perform public.limpiar_practicas();
  if (select count(*) from public.eventos where practica) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'demasiadas_practicas');
  end if;
  v_problema := public.problema_definicion(p_definicion);
  if v_problema is null then
    v_fecha := (p_definicion ->> 'fecha')::date;
    if v_fecha < current_date - 1 or v_fecha > current_date + 1 then v_problema := 'fecha'; end if;
    if coalesce(nullif(p_definicion ->> 'fechaFin', '')::date, v_fecha) > v_fecha + 7 then v_problema := 'fecha'; end if;
  end if;
  if v_problema is not null then
    return jsonb_build_object('ok', false, 'error', 'definicion_invalida', 'detalle', v_problema);
  end if;
  v_id := public.nuevo_id_evento(trim(p_definicion ->> 'nombre'), v_fecha);
  insert into public.eventos (id, nombre, fecha, unidad, estado, es_modelo, practica, definicion,
                              creado_por, abierto_en, abierto_por, actualizado_en)
  values (v_id, trim(p_definicion ->> 'nombre'), v_fecha, p_definicion ->> 'unidad', 'abierto', false, true,
          p_definicion || jsonb_build_object('practica', true),
          public.correo_actual(), now(), public.correo_actual(), now());
  perform public.auditar('crear_practica', 'evento', v_id, null, jsonb_build_object('nombre', p_definicion ->> 'nombre'));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.panel_crear_practica(jsonb) from public, anon;
grant execute on function public.panel_crear_practica(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Panel: los eventos llevan la marca «practica» (el panel la muestra con 🧪 y no la elige sola).
-- Igual a la versión de 010, más el campo practica.
-- ---------------------------------------------------------------------
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
      'practica', e.practica,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb),
      'sinCobro', jsonb_array_length(coalesce(e.definicion -> 'conceptos', '[]'::jsonb)) = 0,
      'inscripcionesCerradasEn', e.inscripciones_cerradas_en, 'inscripcionesCerradasPor', e.inscripciones_cerradas_por
    ) order by e.practica, e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public, anon;
grant execute on function public.panel_eventos() to authenticated;

-- Una práctica no se ofrece para copiar (igual a la versión de 009, sin las prácticas).
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

-- QR de colaboradores: la lista de eventos lleva la marca (igual a la versión de 010, más practica).
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

-- El celular se entera de que es una práctica al activar el QR: activar_acceso devuelve la definición
-- del evento, y panel_crear_practica guarda «practica: true» dentro de esa definición.

select 'Evento de práctica instalado' as resultado,
       (select count(*) from public.eventos where practica) as practicas,
       public.limpiar_practicas() as practicas_vencidas_borradas;
