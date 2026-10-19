-- Pruebas de la Etapa 4.1 en un PostgreSQL local que imita a Supabase.
-- Uso (base vacía): psql -f supabase/pruebas_etapa4.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
-- Imitación de Supabase Auth: el correo del usuario sale de request.jwt.claims.
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant usage on schema public to anon, authenticated;
\i supabase/001_base.sql
\i supabase/002_eventos_modelo.sql
\i supabase/003_accesos_qr.sql
\i supabase/004_usuarios.sql
\i supabase/004_usuarios.sql

\echo '--- 1. primer Responsable general (desde el editor SQL) y no se puede repetir'
select public.alta_primer_responsable('  Carlos@Gmail.com ', 'Carlos Coschiza');
\set ON_ERROR_STOP off
select public.alta_primer_responsable('otro@gmail.com', 'Otro');
\set ON_ERROR_STOP on

\echo '--- 2. desde la app sin ingresar: solo puede preguntar si el correo está habilitado'
set role anon;
select public.correo_habilitado('carlos@gmail.com') as carlos, public.correo_habilitado('nadie@gmail.com') as nadie;
\set ON_ERROR_STOP off
select public.mi_perfil();
select public.alta_primer_responsable('x@x.com', 'X');
\set ON_ERROR_STOP on
reset role;

\echo '--- 3. Carlos ingresa: ve su perfil y da de alta a una organizadora y un tesorero'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.mi_perfil();
select public.panel_guardar_usuario('Ana@Mail.com', ' Ana   Pérez ', array['organizador'], true)->>'ok' as alta_ana;
select public.panel_guardar_usuario('beto@mail.com', 'Beto Ríos', array['tesorero','consulta'], true)->>'ok' as alta_beto;
select public.panel_guardar_usuario('mal', 'Mal', array['consulta'], true)->>'error' as correo_mal;
select public.panel_guardar_usuario('z@mail.com', 'Zoe Paz', array['jefe'], true)->>'error' as rol_inexistente;
\echo '--- 4. no puede quedar sin Responsable general'
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['organizador'], true)->>'error' as quitarse_responsable;
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable'], false)->>'error' as desactivarse;
select jsonb_path_query_array(public.panel_usuarios(), '$.usuarios[*].email') as usuarios;

\echo '--- 5. Ana (organizadora) crea y cierra un QR; no puede dar de alta personas'
set request.jwt.claims = '{"email":"ana@mail.com"}';
select public.mi_perfil()->'roles' as roles_ana;
select public.panel_guardar_usuario('x@mail.com', 'X', array['responsable'], true)->>'error' as ana_alta;
select (public.panel_crear_acceso('congreso-prueba', 'Juan Gómez', 'cargar', now(), now() + interval '3 hours'))->>'ok' as crea_qr;
select (public.panel_datos_accesos()->'accesos'->0->>'creadoPor') as creado_por;
select public.panel_cerrar_acceso((public.panel_datos_accesos()->'accesos'->0->>'id')::uuid)->>'ok' as cierra_qr;

\echo '--- 6. Beto (tesorero) no puede crear QR'
set request.jwt.claims = '{"email":"beto@mail.com"}';
select public.panel_crear_acceso('congreso-prueba', 'X', 'cargar', now(), now() + interval '1 hour')->>'error' as beto_qr;
select public.panel_usuarios()->>'error' as beto_usuarios;

\echo '--- 7. alguien con cuenta pero no habilitado'
set request.jwt.claims = '{"email":"intruso@mail.com"}';
select public.mi_perfil()->>'error' as intruso;
select public.panel_datos_accesos()->>'error' as intruso_qr;

\echo '--- 8. Carlos desactiva a Beto: ya no entra'
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('beto@mail.com', 'Beto Ríos', array['tesorero'], false)->>'ok' as baja_beto;
set request.jwt.claims = '{"email":"beto@mail.com"}';
select public.mi_perfil()->>'error' as beto_despues;

\echo '--- 9. las tablas no se pueden leer directamente (error de permiso esperado)'
\set ON_ERROR_STOP off
select count(*) from public.usuarios;
select count(*) from public.auditoria;
\set ON_ERROR_STOP on
reset role;
reset request.jwt.claims;

\echo '--- 10. hook: solo se crean cuentas de correos habilitados'
select public.hook_antes_de_crear_usuario('{"user":{"email":"ANA@mail.com"}}') as ana,
       public.hook_antes_de_crear_usuario('{"user":{"email":"intruso@mail.com"}}')->'error'->>'http_code' as intruso,
       public.hook_antes_de_crear_usuario('{"user":{"email":"beto@mail.com"}}')->'error'->>'http_code' as beto_desactivado;

\echo '--- 11. la clave provisoria de organizador sigue andando'
select public.fijar_clave_organizador('clave-de-prueba-larga');
set role anon;
select (public.org_crear_acceso('clave-de-prueba-larga', 'congreso-prueba', 'Lía', 'presentes', now(), now() + interval '1 hour'))->>'ok' as org_ok;
reset role;

\echo '--- 12. auditoría'
select quien, accion, entidad, entidad_id from public.auditoria order by id;
