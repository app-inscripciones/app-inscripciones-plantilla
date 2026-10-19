\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'x'; end if;
end $$;
grant anon, authenticated to authenticator;
create schema if not exists extensions;
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
\i supabase/005_panel_control.sql
\i supabase/006_gestion.sql
\i supabase/007_presentes.sql
\i supabase/008_institucion.sql
select public.alta_primer_responsable('carlos@gmail.com', 'Carlos Coschiza');
