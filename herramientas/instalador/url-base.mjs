// Arma la cadena de conexión a la base REAL para el respaldo diario, sin guardar la contraseña en ningún lado:
// el servidor de conexiones (pooler) se consulta a Supabase y la contraseña se calcula con CLAVE_RESPALDO
// (igual que al instalar). Escribe la cadena en la salida; el workflow la oculta en los registros.
// Uso: node herramientas/instalador/url-base.mjs [real|pruebas]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { claveBase } from './instalar.mjs';

export async function urlBase(env, instalacion, tipo = 'real', fetchFn = fetch) {
  const base = instalacion.supabase[tipo];
  const r = await fetchFn(`${env.SUPABASE_API || 'https://api.supabase.com'}/v1/projects/${base.ref}/config/database/pooler`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Supabase respondió ${r.status} al pedir los datos de conexión.`);
  const lista = await r.json();
  const p = lista.find((x) => x.database_type === 'PRIMARY') || lista[0];
  if (!p || !p.db_host) throw new Error('Supabase no devolvió los datos de conexión.');
  const clave = encodeURIComponent(claveBase(env.CLAVE_RESPALDO, base.nombre));
  // Puerto 5432 = modo «sesión» del pooler, el que necesita pg_dump.
  return `postgresql://${encodeURIComponent(p.db_user)}:${clave}@${p.db_host}:5432/${p.db_name || 'postgres'}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    const inst = JSON.parse(readFileSync(path.join(raiz, 'config/instalacion.json'), 'utf8'));
    process.stdout.write(await urlBase(process.env, inst, process.argv[2] || 'real'));
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
