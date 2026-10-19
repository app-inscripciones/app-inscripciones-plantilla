-- =====================================================================
-- Control de las categorías: sus edades no se pueden superponer.
-- El asistente ya lo avisa y no deja seguir; esta es la segunda barrera, en la base:
-- un evento con categorías superpuestas no se puede abrir.
-- Se ejecuta después de 001 a 012. Se puede volver a ejecutar sin problemas.
-- =====================================================================

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
  -- Las edades de las categorías no se pueden superponer (¿en cuál iría alguien de 60 si hay «31 a 60» y «60 a 120»?).
  if exists (
    select 1
    from jsonb_array_elements(d -> 'categorias') a, jsonb_array_elements(d -> 'categorias') b
    where a ->> 'id' < b ->> 'id'
      and jsonb_typeof(a -> 'edadMin') = 'number' and jsonb_typeof(a -> 'edadMax') = 'number'
      and jsonb_typeof(b -> 'edadMin') = 'number' and jsonb_typeof(b -> 'edadMax') = 'number'
      and (a ->> 'edadMin')::numeric <= (b ->> 'edadMax')::numeric
      and (b ->> 'edadMin')::numeric <= (a ->> 'edadMax')::numeric
  ) then return 'edades de categorías superpuestas'; end if;

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
revoke execute on function public.problema_definicion(jsonb) from public, anon, authenticated;

select 'Control de categorías instalado' as resultado;
