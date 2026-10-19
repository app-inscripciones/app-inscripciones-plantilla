// D73 · «Base real (caso testigo)» contra el servidor simulado, ejecutando el SQL de verdad en PostgreSQL local.
// Las dos bases ya existen (como en el caso testigo): la de pruebas con datos (versión 22, institución y práctica de
// Carlos) y la real vacía. Comprueba: no toca Cloudflare, reutiliza las bases, carga la real, copia institución y
// práctica, da de alta al Responsable, escribe conexion.json apuntando a la real y se puede correr dos veces.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const APP = path.resolve(import.meta.dirname, '../..');
const { instalar } = await import(`${APP}/herramientas/instalador/instalar.mjs`);
const { apiSimulada, ENV_PRUEBA } = await import(`${APP}/herramientas/instalador/simulado.mjs`);
const psql = (db, args, input) => execFileSync('psql', ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args], { input, encoding: 'utf8' });
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
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;`;
const REAL = 'ctrealaaaaaaaaaaaaaa', PRUEBAS = 'ctpruebasaaaaaaaaaaa';
for (const db of [REAL, PRUEBAS]) {
  psql('postgres', ['-c', `drop database if exists ${db} with (force)`]); psql('postgres', ['-c', `create database ${db}`]);
  psql(db, ['-f', '-'], supabaseVacio);
}
// La base de pruebas, como la tiene Carlos: completa, con su Responsable, la institución y la práctica hecha.
psql(PRUEBAS, ['-f', `${APP}/base-de-datos-completa.txt`]);
psql(PRUEBAS, ['-c', `select public.alta_primer_responsable('carlos@gmail.com', 'Carlos Coschiza');
  insert into public.institucion (id, nombre, nombre_app, color_principal, color_fondo) values (1, 'Iglesia Central', 'Inscripciones', '#123456', '#F6F7F9');
  insert into public.practicas_hechas (correo, paso) select 'carlos@gmail.com', unnest(array['crear','qr','inscripcion','presente','rendicion']);
  insert into public.practicas_hechas (correo, paso) values ('otra@gmail.com', 'crear');`]);

// Las consultas devuelven filas, como la API de Supabase.
async function ejecutarSql(ref, sql) {
  const q = sql.trim();
  if (/^select\b/i.test(q) && !q.includes(';')) {
    const salida = psql(ref, ['-c', `select coalesce(json_agg(t), '[]') from (${q}) t`]).trim();
    return JSON.parse(salida);
  }
  psql(ref, ['-f', '-'], `set client_min_messages = warning;\n${sql}`);
  return [];
}
const { fetchFn, estado } = apiSimulada({ ejecutarSql });
estado.proyectos.push({ ref: REAL, name: 'inscripciones-real', status: 'ACTIVE_HEALTHY' }, { ref: PRUEBAS, name: 'inscripciones-pruebas', status: 'ACTIVE_HEALTHY' });
const raiz = mkdtempSync(path.join(tmpdir(), 'ct-')); cpSync(`${APP}/supabase`, `${raiz}/supabase`, { recursive: true });
mkdirSync(`${raiz}/config`); cpSync(`${APP}/config/institucion.json`, `${raiz}/config/institucion.json`);
const env = { ...ENV_PRUEBA, CLOUDFLARE_API_TOKEN: '', NOMBRE_INSTITUCION: 'Iglesia', PREFIJO_BASES: 'inscripciones', URL_APP_FIJA: 'https://inscripciones-iglesia.pages.dev/',
  COPIAR_DE_PRUEBAS: '1', CORREO_PROYECTO: 'inscripciones.iglesia@gmail.com', CORREO_RESPONSABLE: 'Carlos@gmail.com', NOMBRE_RESPONSABLE: 'Carlos Coschiza' };
const r = await instalar(env, { fetchFn, raiz, pausa: 0, log: () => {} });
await instalar(env, { fetchFn, raiz, pausa: 0, log: () => {} }); // segunda vez: no rompe ni duplica

assert.equal(r.urlApp, 'https://inscripciones-iglesia.pages.dev');
assert.equal(estado.proyectos.length, 2, 'no crea bases nuevas');
assert.ok(!estado.llamadas.some((l) => l.includes('/client/v4')), 'no toca Cloudflare');
assert.equal(psql(REAL, ['-c', 'select public.version_base()']).trim(), '22');
assert.equal(psql(REAL, ['-c', "select string_agg(u.email || ':' || r.rol, ',') from usuarios u join roles_usuario r on r.usuario_id = u.id"]).trim(), 'carlos@gmail.com:responsable');
assert.equal(psql(REAL, ['-c', 'select nombre || color_principal from institucion']).trim(), 'Iglesia Central#123456');
assert.equal(psql(REAL, ['-c', "select count(*) from practicas_hechas where correo = 'carlos@gmail.com'"]).trim(), '5');
assert.equal(psql(REAL, ['-c', "select count(*) from practicas_hechas where correo <> 'carlos@gmail.com'"]).trim(), '0', 'solo la práctica del Responsable');
assert.equal(psql(PRUEBAS, ['-c', "select count(*) from roles_usuario where rol = 'responsable'"]).trim(), '1', 'en pruebas no agrega otro Responsable');
const conexion = JSON.parse(readFileSync(`${raiz}/config/conexion.json`, 'utf8'));
assert.equal(conexion.url, `https://${REAL}.supabase.co`);
const inst = JSON.parse(readFileSync(`${raiz}/config/instalacion.json`, 'utf8'));
assert.equal(inst.app.proyectoCloudflare, null);
assert.equal(inst.app.publicacion, 'cloudflare-desde-github');
assert.equal(inst.supabase.real.nombre, 'inscripciones-real');
assert.equal(estado.auth[REAL].site_url, 'https://inscripciones-iglesia.pages.dev');
for (const db of [REAL, PRUEBAS]) psql('postgres', ['-c', `drop database if exists ${db} with (force)`]);
console.log('OK: base real del caso testigo (D73)');
