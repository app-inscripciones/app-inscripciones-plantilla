// Instalador contra el servidor simulado, pero ejecutando el SQL de verdad en PostgreSQL local (una base por proyecto).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const APP = '/home/claude/app-inscripciones';
const { instalar } = await import(`${APP}/herramientas/instalador/instalar.mjs`);
const { apiSimulada, ENV_PRUEBA } = await import(`${APP}/herramientas/instalador/simulado.mjs`);
const psql = (db, args, input) => execFileSync('psql', ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args], { input, encoding: 'utf8' });
const preparadas = new Set();
const supabaseVacio = `
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.jwt() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Como en Supabase: todo lo nuevo en public queda habilitado para anon y authenticated salvo que se revoque.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;`;
async function ejecutarSql(ref, sql) {
  if (!preparadas.has(ref)) {
    psql('postgres', ['-c', `drop database if exists ${ref}`]); psql('postgres', ['-c', `create database ${ref}`]);
    psql(ref, ['-f', '-'], supabaseVacio); preparadas.add(ref);
  }
  const salida = psql(ref, ['-f', '-'], `set client_min_messages = warning;\n${sql}`);
  return salida ? [{ salida }] : [];
}
const raiz = mkdtempSync(path.join(tmpdir(), 'inst-')); cpSync(`${APP}/supabase`, `${raiz}/supabase`, { recursive: true });
mkdirSync(`${raiz}/config`); cpSync(`${APP}/config/institucion.json`, `${raiz}/config/institucion.json`);
const { fetchFn, estado } = apiSimulada({ ejecutarSql });
const r = await instalar(ENV_PRUEBA, { fetchFn, raiz, pausa: 0 });
console.log('primera vez OK', r);
await instalar(ENV_PRUEBA, { fetchFn, raiz, pausa: 0, log: () => {} });
console.log('segunda vez OK (consultas:', estado.consultas.length, ')');
const real = r.bases.real;
console.log(psql(real, ['-c', `select email, (select string_agg(rol, ',') from roles_usuario where usuario_id = u.id) from usuarios u;
  select count(*) || ' eventos' from eventos;
  set role authenticated; set request.jwt.claims = '{"email":"marta.lopez@gmail.com"}';
  select public.mi_perfil()::text;
  select public.institucion_publica()::text;`]));

console.log('--- funciones que puede ejecutar anon:');
console.log(psql(real, ['-c', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`]));
console.log('--- funciones que puede ejecutar authenticated (y no anon):');
console.log(psql(real, ['-c', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') order by 1`]));
console.log('--- tablas que anon puede leer:');
console.log(psql(real, ['-c', `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')) order by 1`]));
