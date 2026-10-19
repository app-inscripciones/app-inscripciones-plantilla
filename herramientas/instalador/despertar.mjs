// D74 · Despierta las bases de Supabase si el plan gratuito las pausó (lo mismo que el botón «Resume project»).
// Lo corren solos el respaldo diario, la revisión diaria y el botón «Despertar la base». Nadie tiene que entrar a
// supabase.com. Usa SUPABASE_ACCESS_TOKEN y config/instalacion.json (las referencias de las dos bases).
// Escribe en la salida una línea por base: «real: activa», «real: despertada», «real: no se pudo (…)».
// Uso: node herramientas/instalador/despertar.mjs   (devuelve error solo si la base REAL no quedó activa)
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function despertar(env, instalacion, { fetchFn = fetch, pausa = 15000, intentos = 60, log = console.log } = {}) {
  const api = env.SUPABASE_API || 'https://api.supabase.com';
  const h = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
  const estadoDe = async (ref) => {
    const r = await fetchFn(`${api}/v1/projects/${ref}`, { headers: h });
    if (r.status === 401 || r.status === 403) throw new Error('la llave de Supabase (SUPABASE_ACCESS_TOKEN) no sirve');
    if (!r.ok) throw new Error(`Supabase respondió ${r.status}`);
    return (await r.json()).status;
  };
  // Una consulta mínima: cuenta como uso, así el plan gratuito no la pausa (se pausa tras una semana sin uso).
  const tocar = async (ref) => {
    try { await fetchFn(`${api}/v1/projects/${ref}/database/query`, { method: 'POST', headers: h, body: JSON.stringify({ query: 'select 1' }) }); } catch { /* no frena */ }
  };
  const resultado = {};
  for (const tipo of ['real', 'pruebas']) {
    const base = instalacion && instalacion.supabase && instalacion.supabase[tipo];
    if (!base || !base.ref) continue;
    try {
      let estado = await estadoDe(base.ref);
      if (estado === 'ACTIVE_HEALTHY') { resultado[tipo] = 'activa'; await tocar(base.ref); log(`La base ${tipo}: activa`); continue; }
      if (/INACTIVE|PAUSE/.test(estado)) {
        log(`La base ${tipo} (${base.nombre}) estaba pausada: despertándola…`);
        const r = await fetchFn(`${api}/v1/projects/${base.ref}/restore`, { method: 'POST', headers: h, body: '{}' });
        if (!r.ok && r.status !== 400) throw new Error(`Supabase respondió ${r.status} al despertarla`);
      }
      for (let i = 0; i < intentos && estado !== 'ACTIVE_HEALTHY'; i++) {
        await esperar(pausa);
        estado = await estadoDe(base.ref);
        if (['INIT_FAILED', 'REMOVED', 'RESTORE_FAILED'].includes(estado)) throw new Error(`quedó en estado ${estado}`);
      }
      resultado[tipo] = estado === 'ACTIVE_HEALTHY' ? 'despertada' : `no se pudo (sigue en ${estado})`;
      if (estado === 'ACTIVE_HEALTHY') await tocar(base.ref);
    } catch (e) {
      resultado[tipo] = `no se pudo (${e.message})`;
    }
    log(`La base ${tipo}: ${resultado[tipo]}`);
  }
  return resultado;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const archivo = path.join(raiz, 'config/instalacion.json');
  if (!existsSync(archivo) || !process.env.SUPABASE_ACCESS_TOKEN) {
    console.log('Sin config/instalacion.json o sin SUPABASE_ACCESS_TOKEN: no se revisa si las bases están pausadas.');
    process.exit(0);
  }
  const r = await despertar(process.env, JSON.parse(readFileSync(archivo, 'utf8')));
  // Para la revisión diaria (avisa que se despertó sola) y el resumen de la ejecución.
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `BASES_DESPERTADAS=${Object.entries(r).filter(([, v]) => v === 'despertada').map(([k]) => k).join(',')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Bases de datos', '', ...Object.entries(r).map(([k, v]) => `- **${k}:** ${v === 'activa' ? '✅ activa' : v === 'despertada' ? '✅ estaba pausada y se despertó sola' : `❌ ${v}`}`), ''].join('\n'));
  }
  if (r.real && r.real.startsWith('no se pudo')) {
    console.error(`::error::La base real ${r.real}. Entrá a supabase.com, abrí el proyecto y tocá «Resume project».`);
    process.exit(1);
  }
}
