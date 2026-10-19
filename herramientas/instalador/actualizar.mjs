// P13 · Actualizar una institución ya instalada: después de traer el código nuevo de la plantilla
// (lo hace el workflow «Actualizar»), vuelve a cargar los archivos SQL en sus dos bases.
// Todos los archivos SQL se pueden ejecutar más de una vez: no se pierde ningún dato.
// Necesita SUPABASE_ACCESS_TOKEN y config/instalacion.json (lo escribió el instalador).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cliente, cargarTablas } from './instalar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function actualizarBases(env, { fetchFn = fetch, log = console.log, raiz = RAIZ } = {}) {
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('Falta el secret SUPABASE_ACCESS_TOKEN.');
  let inst;
  try {
    inst = JSON.parse(readFileSync(path.join(raiz, 'config/instalacion.json'), 'utf8'));
  } catch {
    throw new Error('No está config/instalacion.json: esta copia no se instaló con el botón «Instalar».');
  }
  const sb = cliente(env.SUPABASE_API || 'https://api.supabase.com', env.SUPABASE_ACCESS_TOKEN, 'Supabase', fetchFn);
  const bases = [inst.supabase.real, inst.supabase.pruebas];
  for (const b of bases) {
    const p = await sb('GET', `/v1/projects/${b.ref}`);
    if (p.status !== 'ACTIVE_HEALTHY') throw new Error(`La base ${b.nombre} no está activa (${p.status}). Si está pausada, reanudala desde supabase.com y volvé a actualizar.`);
  }
  log('Actualizando las bases (las tablas y los datos se conservan)');
  await cargarTablas(sb, bases, raiz, log);
  return bases.map((b) => b.ref);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    await actualizarBases(process.env);
    console.log('Bases actualizadas.');
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
