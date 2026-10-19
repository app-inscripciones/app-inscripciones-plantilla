-- =====================================================================
-- Permisos: cierre por defecto (refuerzo de seguridad)
-- En Supabase, toda función nueva del esquema public queda habilitada para «anon» (cualquiera)
-- y «authenticated» (cualquiera con sesión), aunque se revoque a «public». Las funciones del panel
-- ya controlan el rol de quien llama, pero conviene una segunda barrera:
--  · se quita el permiso a TODAS las funciones,
--  · se habilitan solo las que usa la app, a quien corresponde,
--  · y lo nuevo que se agregue en el futuro queda cerrado salvo que se habilite explícitamente.
-- Se ejecuta después de 001 a 010. Se puede volver a ejecutar sin problemas.
-- =====================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare
  f record;
  -- Celulares de colaboradores y pantalla de ingreso (sin sesión): anon y authenticated.
  publicas text[] := array['activar_acceso', 'estado_sesion', 'enviar_inscripcion', 'enviar_inscripcion_y_presente',
                           'enviar_marcas', 'lista_puerta', 'institucion_publica', 'correo_habilitado'];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname as nombre
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.nombre = any(publicas) then
      execute format('grant execute on function %s to anon, authenticated', f.firma);
    elsif f.nombre like 'panel\_%' or f.nombre = 'mi_perfil' then
      -- Panel: solo con sesión iniciada (y cada función controla además el rol).
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $$;

-- El hook de Supabase Auth lo ejecuta el servicio de autenticación.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hook_antes_de_crear_usuario(jsonb) to supabase_auth_admin';
  end if;
end $$;

select 'Permisos revisados' as resultado,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')) as funciones_publicas;
