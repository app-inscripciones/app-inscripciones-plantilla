-- Recuperar un respaldo (D59), paso 1 de 3: deja vacío el esquema «public» de la base de DESTINO
-- (tablas, funciones, secuencias y tipos de la aplicación) para cargar ahí la copia.
-- Seguro: no hace nada si no se ejecuta desde recuperar.sh, que antes fija «recuperar.confirmado».
-- No toca los esquemas de Supabase (auth, storage, extensions…): los usuarios del panel siguen igual.
do $$
declare
  r record;
begin
  if coalesce(current_setting('recuperar.confirmado', true), '') <> 'si' then
    raise exception 'Seguro activado: esta limpieza solo se ejecuta desde herramientas/recuperar/recuperar.sh';
  end if;
  for r in select format('%I.%I', schemaname, viewname) as n from pg_views where schemaname = 'public' loop
    execute 'drop view if exists ' || r.n || ' cascade';
  end loop;
  for r in select format('%I.%I', schemaname, tablename) as n from pg_tables where schemaname = 'public' loop
    execute 'drop table if exists ' || r.n || ' cascade';
  end loop;
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prokind in ('f', 'p')
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
  for r in select format('%I.%I', sequence_schema, sequence_name) as n from information_schema.sequences where sequence_schema = 'public' loop
    execute 'drop sequence if exists ' || r.n || ' cascade';
  end loop;
end $$;
