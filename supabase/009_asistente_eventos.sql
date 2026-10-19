-- =====================================================================
-- Etapa 6 · Asistente para crear eventos (R13, D15, D30)
--  · El Organizador arma el evento de a pasos; mientras tanto queda como BORRADOR
--    (no aparece en el panel ni para los QR).
--  · Al ABRIRLO, la definición (formulario, categorías, cobros, asistencia) queda FIJA.
--    Lo único que se puede cambiar después son los momentos de asistencia (D32, archivo 008).
-- Se ejecuta UNA VEZ en el editor SQL de Supabase, después de 001 a 008.
-- Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.eventos add column if not exists actualizado_en timestamptz not null default now();
alter table public.eventos add column if not exists creado_por text;
alter table public.eventos add column if not exists abierto_en timestamptz;
alter table public.eventos add column if not exists abierto_por text;

-- ---------------------------------------------------------------------
-- Control de una definición antes de abrir el evento (red de seguridad:
-- la app ya revisa todo esto y lo explica en palabras simples).
-- Devuelve null si está bien, o un texto con el problema.
-- ---------------------------------------------------------------------
create or replace function public.problema_definicion(d jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c jsonb; k jsonb; t jsonb; i jsonb; m jsonb;
  v_ids text[] := '{}';
  v_cats text[] := '{}';
begin
  if d is null or jsonb_typeof(d) <> 'object' then return 'sin definición'; end if;
  if length(d::text) > 100000 then return 'definición demasiado grande'; end if;
  if length(trim(coalesce(d ->> 'nombre', ''))) not between 3 and 120 then return 'nombre'; end if;
  if coalesce(d ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha'; end if;
  if coalesce(d ->> 'unidad', '') not in ('persona', 'pareja') then return 'unidad'; end if;

  if jsonb_typeof(d -> 'categorias') <> 'array' then return 'categorias'; end if;
  for c in select * from jsonb_array_elements(d -> 'categorias') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_cats)
       or length(trim(coalesce(c ->> 'nombre', ''))) < 2 then return 'categoría'; end if;
    v_cats := v_cats || (c ->> 'id');
  end loop;
  if cardinality(v_cats) = 1 then return 'una sola categoría'; end if;

  if jsonb_typeof(d -> 'campos') <> 'array' or jsonb_array_length(d -> 'campos') not between 1 and 60 then return 'campos'; end if;
  for c in select * from jsonb_array_elements(d -> 'campos') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_ids) or c ->> 'id' = 'categoria' then return 'campo ' || coalesce(c ->> 'id', '?'); end if;
    if length(trim(coalesce(c ->> 'etiqueta', ''))) < 2 then return 'campo sin texto'; end if;
    if coalesce(c ->> 'tipo', '') not in ('texto', 'dni', 'telefono', 'numero', 'si_no', 'opcion') then return 'tipo de campo'; end if;
    if c ->> 'tipo' = 'opcion' and (jsonb_typeof(c -> 'opciones') <> 'array' or jsonb_array_length(c -> 'opciones') < 2) then return 'opciones'; end if;
    v_ids := v_ids || (c ->> 'id');
  end loop;
  if d ->> 'unidad' = 'persona' and not ('nombre' = any(v_ids)) then return 'falta el nombre'; end if;
  if d ->> 'unidad' = 'pareja' and not ('hombre' = any(v_ids) and 'mujer' = any(v_ids)) then return 'faltan los nombres de la pareja'; end if;

  -- Un evento sin cobro (D45) no tiene conceptos; los demás, al menos uno.
  if jsonb_typeof(d -> 'conceptos') <> 'array' then return 'conceptos'; end if;
  if coalesce((d ->> 'sinCobro')::boolean, false) then
    if jsonb_array_length(d -> 'conceptos') > 0 then return 'evento sin cobro con conceptos'; end if;
  elsif jsonb_array_length(d -> 'conceptos') < 1 then return 'conceptos'; end if;
  for k in select * from jsonb_array_elements(d -> 'conceptos') loop
    if length(trim(coalesce(k ->> 'nombre', ''))) < 2 then return 'concepto sin nombre'; end if;
    if jsonb_typeof(k -> 'precios') <> 'array' or jsonb_array_length(k -> 'precios') not between 1 and 2 then return 'precios'; end if;
    for t in select * from jsonb_array_elements(k -> 'precios') loop
      if t ? 'porCategoria' then
        for m in select value from jsonb_each(t -> 'porCategoria') loop
          if jsonb_typeof(m) <> 'number' or (m #>> '{}')::numeric < 0 or (m #>> '{}')::numeric <> trunc((m #>> '{}')::numeric) then return 'precio'; end if;
        end loop;
      elsif jsonb_typeof(t -> 'monto') <> 'number' or (t ->> 'monto')::numeric < 0 or (t ->> 'monto')::numeric <> trunc((t ->> 'monto')::numeric) then
        return 'precio';
      end if;
    end loop;
  end loop;

  if coalesce((d -> 'asistencia' ->> 'toma')::boolean, false) then
    if jsonb_typeof(d -> 'asistencia' -> 'instancias') <> 'array'
       or jsonb_array_length(d -> 'asistencia' -> 'instancias') not between 1 and 30 then return 'momentos de asistencia'; end if;
    for i in select * from jsonb_array_elements(d -> 'asistencia' -> 'instancias') loop
      if coalesce(i ->> 'id', '') = '' or length(trim(coalesce(i ->> 'nombre', ''))) < 2
         or coalesce(i ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'momento de asistencia'; end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.problema_definicion(jsonb) from public;

-- Identificador legible y único a partir del nombre: «Campamento de jóvenes» → campamento-de-jovenes-2027
-- (p_actual: el id que ya tiene el evento, para no considerarlo repetido consigo mismo).
drop function if exists public.nuevo_id_evento(text, date);
create or replace function public.nuevo_id_evento(p_nombre text, p_fecha date, p_actual text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_id text;
  n integer := 2;
begin
  v_base := lower(translate(coalesce(p_nombre, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_base := trim(both '-' from regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'));
  v_base := left(coalesce(nullif(v_base, ''), 'evento'), 50) || coalesce('-' || extract(year from p_fecha)::text, '');
  v_id := v_base;
  while exists (select 1 from public.eventos where id = v_id and id is distinct from p_actual) loop
    v_id := v_base || '-' || n;
    n := n + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.nuevo_id_evento(text, date, text) from public;

-- ---------------------------------------------------------------------
-- Lista de borradores y de eventos que se pueden copiar (Organizador)
-- ---------------------------------------------------------------------
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
      from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_borradores() from public;
grant execute on function public.panel_borradores() to authenticated;

-- ---------------------------------------------------------------------
-- Guardar el borrador (se llama en cada paso del asistente).
--  p_id null = borrador nuevo. Un evento ya abierto NO se puede cambiar por acá.
-- ---------------------------------------------------------------------
create or replace function public.panel_guardar_borrador(p_id text, p_borrador jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_nombre text;
  v_fecha date;
  v_unidad text;
  v_id text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if p_borrador is null or jsonb_typeof(p_borrador) <> 'object' or length(p_borrador::text) > 100000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_nombre := coalesce(nullif(trim(coalesce(p_borrador ->> 'nombre', '')), ''), 'Evento sin nombre');
  begin
    v_fecha := nullif(p_borrador ->> 'fecha', '')::date;
  exception when others then v_fecha := null;
  end;
  v_unidad := case when p_borrador ->> 'unidad' = 'pareja' then 'pareja' else 'persona' end;

  if p_id is null or p_id = '' then
    v_id := public.nuevo_id_evento(v_nombre, v_fecha);
    insert into public.eventos (id, nombre, fecha, unidad, estado, es_modelo, definicion, creado_por, actualizado_en)
    values (v_id, left(v_nombre, 120), coalesce(v_fecha, current_date), v_unidad, 'borrador', false, p_borrador, public.correo_actual(), now());
    perform public.auditar('crear_borrador', 'evento', v_id, null, jsonb_build_object('nombre', v_nombre));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_ev from public.eventos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_ev.estado <> 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_ya_abierto'); end if;
  update public.eventos
     set nombre = left(v_nombre, 120), fecha = coalesce(v_fecha, fecha), unidad = v_unidad,
         definicion = p_borrador, actualizado_en = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;
revoke all on function public.panel_guardar_borrador(text, jsonb) from public;
grant execute on function public.panel_guardar_borrador(text, jsonb) to authenticated;

create or replace function public.panel_borrar_borrador(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_ev.estado <> 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_ya_abierto'); end if;
  delete from public.eventos where id = p_id;
  perform public.auditar('borrar_borrador', 'evento', p_id, jsonb_build_object('nombre', v_ev.nombre), null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_borrar_borrador(text) from public;
grant execute on function public.panel_borrar_borrador(text) to authenticated;

-- ---------------------------------------------------------------------
-- Abrir el evento: guarda la definición final y desde ahí queda fija.
-- ---------------------------------------------------------------------
create or replace function public.panel_abrir_evento(p_id text, p_definicion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_problema text;
  v_id text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_ev.estado <> 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_ya_abierto'); end if;
  v_problema := public.problema_definicion(p_definicion);
  if v_problema is null and (p_definicion ->> 'fecha')::date < current_date - 1 then v_problema := 'la fecha ya pasó'; end if;
  if v_problema is not null then
    return jsonb_build_object('ok', false, 'error', 'definicion_invalida', 'detalle', v_problema);
  end if;
  -- El identificador definitivo sale del nombre y el año (el borrador pudo crearse antes de elegir la fecha).
  -- Un borrador todavía no tiene inscripciones ni QR, así que se puede renombrar sin riesgo.
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

select 'Asistente de eventos instalado' as resultado,
       (select count(*) from public.eventos where estado = 'borrador') as borradores;
