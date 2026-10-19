// Revisión diaria y avisos automáticos (Etapa 9, punto 4; D58).
// La corre GitHub todos los días (workflow «Revisión diaria»). Revisa:
//   1. que el respaldo diario haya salido bien (y que siga corriendo),
//   2. que la base responda y que las bases de Supabase estén activas (no pausadas),
//   3. que las llaves de Supabase y de Cloudflare sigan sirviendo (y cuándo vence la de Cloudflare),
//   4. que la base esté actualizada con la versión del código,
//   5. el espacio usado (el plan gratuito permite 500 MB),
//   6. que el Gmail pueda mandar correos (contraseña de aplicación).
// Guarda el resultado en la base (el panel lo muestra en «Estado del sistema») y, si algo necesita atención,
// manda un correo en castellano a los Responsables generales. Si hay un problema y el correo no se puede mandar,
// termina con error: así GitHub avisa por su cuenta (segunda red de seguridad).
//
// Uso (desde GitHub Actions): node herramientas/revision/revisar.mjs
// Variables: URL_BASE (conexión a la base real), GITHUB_TOKEN, GITHUB_REPOSITORY, y si están:
//   SUPABASE_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, GMAIL_CLAVE_APLICACION, GMAIL_CORREO.
import { readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HORAS_RESPALDO = 36;
const DIA = 24 * 3600 * 1000;

// Versión que espera el código: el número del último archivo SQL (001_… a 016_…).
export function versionCodigo(dir = path.join(RAIZ, 'supabase')) {
  return Math.max(...readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => Number(f.slice(0, 3))));
}

const r = (id, estado, titulo, detalle = '', queHacer = '') => ({ id, estado, titulo, detalle, queHacer });
const fecha = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

async function pedir(fetchFn, url, headers) {
  const res = await fetchFn(url, { headers });
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, ok: res.ok, cuerpo };
}

// --------------------------------------------------------------------------- revisiones una por una
export async function revisarRespaldo({ env, fetchFn, ahora }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return r('respaldo', 'aviso', 'No se pudo revisar el respaldo', 'Faltan los datos de GitHub para consultarlo.', 'Mirá GitHub → Actions → «Respaldo diario».');
  const api = env.GITHUB_API || 'https://api.github.com';
  let x;
  try {
    x = await pedir(fetchFn, `${api}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/respaldo-diario.yml/runs?per_page=10`,
      { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' });
  } catch {
    return r('respaldo', 'aviso', 'No se pudo revisar el respaldo', 'GitHub no respondió.', 'Mirá GitHub → Actions → «Respaldo diario».');
  }
  if (!x.ok) return r('respaldo', 'aviso', 'No se pudo revisar el respaldo', `GitHub respondió ${x.status}.`, 'Mirá GitHub → Actions → «Respaldo diario».');
  const corridas = ((x.cuerpo && x.cuerpo.workflow_runs) || []).filter((c) => c.status === 'completed');
  const ultima = corridas[0];
  const queHacerCorrer = 'GitHub → pestaña «Actions» → «Respaldo diario». Si dice que está desactivado, tocá «Enable workflow». Después tocá «Run workflow»: tiene que terminar en verde ✅.';
  if (!ultima) return r('respaldo', 'problema', 'Todavía no se hizo ningún respaldo', 'No hay ninguna copia de seguridad de los datos.', queHacerCorrer);
  const horas = Math.round((ahora - new Date(ultima.created_at)) / 3600000);
  if (ultima.conclusion !== 'success') {
    return r('respaldo', 'problema', 'El último respaldo falló', `Fue el ${fecha(ultima.created_at)}.`,
      'GitHub → «Actions» → «Respaldo diario» → abrí la ejecución en rojo ❌ y buscá el mensaje en la guía «¿Qué hago si…?» («falló el Respaldo diario»). Después tocá «Run workflow».');
  }
  if (horas > HORAS_RESPALDO) {
    return r('respaldo', 'problema', `El respaldo no corre hace ${Math.round(horas / 24)} días`, `El último salió bien el ${fecha(ultima.created_at)}, pero desde entonces no se hizo otro.`, queHacerCorrer);
  }
  return r('respaldo', 'ok', 'Respaldo diario', `El último salió bien el ${fecha(ultima.created_at)}.`);
}

export async function revisarBase({ consultar }) {
  try {
    const b = await consultar('select public.revision_base()');
    return { base: b, resultado: r('base', 'ok', 'Base de datos', 'Responde normalmente.') };
  } catch (e) {
    return {
      base: null,
      resultado: r('base', 'problema', 'No se pudo conectar con la base de datos', `Puede estar pausada o la conexión cambió (${String(e.message || e).slice(0, 120)}).`,
        'Entrá a supabase.com, abrí el proyecto de la base real y, si dice «Paused», tocá «Resume project». Tarda unos minutos y no se pierde nada.'),
    };
  }
}

export async function revisarSupabase({ env, instalacion, fetchFn }) {
  if (!env.SUPABASE_ACCESS_TOKEN || !instalacion || !instalacion.supabase) return [];
  const api = env.SUPABASE_API || 'https://api.supabase.com';
  const out = [];
  for (const tipo of ['real', 'pruebas']) {
    const base = instalacion.supabase[tipo];
    if (!base || !base.ref) continue;
    let x;
    try {
      x = await pedir(fetchFn, `${api}/v1/projects/${base.ref}`, { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` });
    } catch {
      out.push(r(`supabase_${tipo}`, 'aviso', `No se pudo consultar la base ${tipo}`, 'Supabase no respondió.', 'Volvé a mirar mañana. Si se repite, entrá a supabase.com y fijate el estado del proyecto.'));
      continue;
    }
    if (x.status === 401 || x.status === 403) {
      return [r('llave_supabase', 'problema', 'La llave de Supabase ya no sirve', 'Sin ella no se pueden hacer los respaldos ni las actualizaciones.',
        'Creá una llave nueva en Supabase (manual de instalación, paso 4, «sin vencimiento») y cargala en GitHub con el mismo nombre, SUPABASE_ACCESS_TOKEN (paso 6).')];
    }
    const estado = x.cuerpo && x.cuerpo.status;
    if (!x.ok) out.push(r(`supabase_${tipo}`, 'aviso', `No se pudo consultar la base ${tipo}`, `Supabase respondió ${x.status}.`, 'Entrá a supabase.com y fijate el estado del proyecto.'));
    else if (estado && estado !== 'ACTIVE_HEALTHY') {
      const pausada = /PAUSE|INACTIVE/.test(estado);
      out.push(r(`supabase_${tipo}`, tipo === 'real' ? 'problema' : 'aviso', pausada ? `La base ${tipo} está pausada` : `La base ${tipo} no está funcionando bien`, `Supabase dice: ${estado}.`,
        pausada ? `Entrá a supabase.com, abrí el proyecto «${base.nombre}» y tocá «Resume project». No se pierde nada.` : 'Esperá un rato y volvé a mirar. Si sigue igual, entrá a supabase.com y fijate el estado del proyecto.'));
    }
  }
  if (!out.some((x) => x.estado !== 'ok')) out.push(r('llave_supabase', 'ok', 'Llave de Supabase y bases activas', 'La llave sirve y las dos bases están funcionando.'));
  return out;
}

export async function revisarCloudflare({ env, fetchFn, ahora }) {
  if (!env.CLOUDFLARE_API_TOKEN) return null;
  const api = env.CLOUDFLARE_API || 'https://api.cloudflare.com';
  const queHacer = 'Creá una llave nueva en Cloudflare (manual de instalación, paso 5) y cargala en GitHub con el mismo nombre, CLOUDFLARE_API_TOKEN (paso 6).';
  let x;
  try {
    x = await pedir(fetchFn, `${api}/client/v4/user/tokens/verify`, { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` });
  } catch {
    return r('llave_cloudflare', 'aviso', 'No se pudo revisar la llave de Cloudflare', 'Cloudflare no respondió.', 'Volvé a mirar mañana.');
  }
  const res = x.cuerpo && x.cuerpo.result;
  if (!x.ok || !res || res.status !== 'active') {
    return r('llave_cloudflare', 'problema', 'La llave de Cloudflare ya no sirve', 'Sin ella no se pueden publicar las actualizaciones de la app (la app que ya está publicada sigue andando).', queHacer);
  }
  if (res.expires_on) {
    const dias = Math.floor((new Date(res.expires_on) - ahora) / DIA);
    if (dias <= 30) return r('llave_cloudflare', dias <= 7 ? 'problema' : 'aviso', `La llave de Cloudflare vence en ${Math.max(dias, 0)} días`, `Vence el ${fecha(res.expires_on)}.`, queHacer);
  }
  return r('llave_cloudflare', 'ok', 'Llave de Cloudflare', res.expires_on ? `Sirve y vence el ${fecha(res.expires_on)}.` : 'Sirve y no vence.');
}

export function revisarVersion(base, esperada) {
  if (!base) return null;
  if (Number(base.version) < esperada) {
    return r('version', 'aviso', 'Falta actualizar la base de datos', `La base está en la versión ${base.version} y el programa en la ${esperada}.`,
      'GitHub → pestaña «Actions» → «Actualizar» → «Run workflow». Tarda unos 5 minutos y no se pierden datos.');
  }
  return r('version', 'ok', 'Versión de la base', `Al día (versión ${base.version}).`);
}

export function revisarEspacio(base) {
  if (!base) return null;
  const pct = Math.round((100 * Number(base.espacioUsado)) / Number(base.espacioLimite));
  const mb = Math.round(Number(base.espacioUsado) / 1048576);
  const queHacer = 'Los eventos viejos ocupan lugar: descargá su Excel y consultá cómo liberar espacio (guía «¿Qué hago si…?»). Pasar al plan pago de Supabase también lo resuelve, pero tiene costo.';
  if (pct >= 95) return r('espacio', 'problema', `La base está casi llena (${pct} %)`, `Usa ${mb} MB de 500 MB.`, queHacer);
  if (pct >= 80) return r('espacio', 'aviso', `La base está al ${pct} % de su espacio`, `Usa ${mb} MB de 500 MB.`, queHacer);
  return r('espacio', 'ok', 'Espacio de la base', `Usa ${mb} MB de 500 MB (${pct} %).`);
}

export async function revisarCorreo({ env, gmail, probarCorreo }) {
  if (!env.GMAIL_CLAVE_APLICACION || !gmail) {
    return r('correo', 'aviso', 'Los avisos por correo no están configurados', 'Falta la contraseña de aplicación del Gmail en GitHub: los avisos solo se ven en el panel.',
      'Cargá en GitHub el secret GMAIL_CLAVE_APLICACION (manual de instalación, paso 6).');
  }
  try {
    await probarCorreo(gmail, env.GMAIL_CLAVE_APLICACION);
    return r('correo', 'ok', 'Correo de la institución', 'El Gmail puede mandar correos (códigos de ingreso y avisos).');
  } catch (e) {
    return r('correo', 'problema', 'El Gmail de la institución no puede mandar correos', `Google rechazó la contraseña de aplicación (${String(e.message || e).slice(0, 80)}). Tampoco van a llegar los códigos para entrar al panel.`,
      'Creá una contraseña de aplicación nueva (manual de instalación, paso 1), cargala en GitHub como GMAIL_CLAVE_APLICACION y tocá «Instalar» otra vez.');
  }
}

// --------------------------------------------------------------------------- correo
export function hayQueAvisar(resultados, anteriores) {
  if (resultados.some((x) => x.estado === 'problema')) return true; // un problema se avisa todos los días hasta que se arregle
  const avisos = (lista) => (lista || []).filter((x) => x.estado === 'aviso').map((x) => `${x.id}|${x.titulo}`).sort().join(',');
  return avisos(resultados) !== '' && avisos(resultados) !== avisos(anteriores); // un aviso, solo cuando es nuevo
}

export function armarCorreo(resultados, { institucion, urlApp }) {
  const malos = resultados.filter((x) => x.estado !== 'ok');
  const bien = resultados.filter((x) => x.estado === 'ok').map((x) => x.titulo.toLowerCase());
  const problemas = malos.filter((x) => x.estado === 'problema').length;
  const asunto = problemas
    ? `⚠️ Sistema de inscripciones: ${problemas === 1 ? 'hay un problema' : `hay ${problemas} problemas`} para resolver`
    : '🟡 Sistema de inscripciones: hay algo para revisar';
  const lineas = [
    'Hola:',
    '',
    `La revisión automática del sistema de inscripciones${institucion ? ` de ${institucion}` : ''} encontró esto:`,
    '',
  ];
  for (const x of malos) {
    lineas.push(`${x.estado === 'problema' ? '🔴' : '🟡'} ${x.titulo}`);
    if (x.detalle) lineas.push(`   ${x.detalle}`);
    if (x.queHacer) lineas.push(`   Qué hacer: ${x.queHacer}`);
    lineas.push('');
  }
  if (bien.length) lineas.push(`Lo demás está en orden: ${bien.join(', ')}.`, '');
  if (urlApp) {
    lineas.push(`Podés ver el estado en el panel: ${urlApp}/#panel → «Estado del sistema».`);
    lineas.push(`Si no sabés cómo seguir, buscá el caso en la guía «¿Qué hago si…?»: ${urlApp}/#ayuda`);
  }
  lineas.push('', 'Este correo lo manda solo el sistema cuando hay algo para revisar. No hace falta responderlo.');
  return { asunto, texto: lineas.join('\n') };
}

// --------------------------------------------------------------------------- todo junto
export async function revisar({ env, instalacion, consultar, fetchFn = fetch, probarCorreo, enviarCorreo, ahora = new Date(), esperada = versionCodigo() }) {
  const gmail = env.GMAIL_CORREO || (instalacion && instalacion.correo) || '';
  const resultados = [];
  const { base, resultado } = await revisarBase({ consultar });
  resultados.push(resultado);
  resultados.push(await revisarRespaldo({ env, fetchFn, ahora }));
  resultados.push(...(await revisarSupabase({ env, instalacion, fetchFn })));
  const cf = await revisarCloudflare({ env, fetchFn, ahora });
  if (cf) resultados.push(cf);
  for (const x of [revisarVersion(base, esperada), revisarEspacio(base)]) if (x) resultados.push(x);
  resultados.push(await revisarCorreo({ env, gmail, probarCorreo }));

  let anteriores = [];
  if (base) {
    try { anteriores = (await consultar("select coalesce((select resultados from public.revisiones order by cuando desc limit 1), '[]'::jsonb)")) || []; } catch { /* sin revisiones */ }
  }
  let correo = null;
  const problema = resultados.some((x) => x.estado === 'problema');
  if (hayQueAvisar(resultados, anteriores)) {
    const destinos = [...new Set([...((base && base.responsables) || []), gmail].filter(Boolean))];
    const puedeMandar = gmail && env.GMAIL_CLAVE_APLICACION && !resultados.some((x) => x.id === 'correo' && x.estado !== 'ok');
    if (puedeMandar && destinos.length) {
      const { asunto, texto } = armarCorreo(resultados, { institucion: instalacion && instalacion.institucion, urlApp: instalacion && instalacion.app && instalacion.app.url });
      try {
        await enviarCorreo({ de: gmail, clave: env.GMAIL_CLAVE_APLICACION, para: destinos, asunto, texto });
        correo = `Aviso enviado a ${destinos.join(', ')}`;
      } catch (e) {
        correo = `No se pudo mandar el aviso: ${String(e.message || e).slice(0, 100)}`;
      }
    } else correo = 'No se pudo mandar el aviso por correo (falta configurar el Gmail).';
  }
  if (base) {
    const json = JSON.stringify(resultados).replace(/\$rev\$/g, '');
    const nota = correo ? `$rev$${correo.replace(/\$rev\$/g, '')}$rev$` : 'null';
    await consultar(`select public.registrar_revision($rev$${json}$rev$::jsonb, ${nota})`);
  }
  const avisoEnviado = !!(correo && correo.startsWith('Aviso enviado'));
  return { resultados, correo, fallar: problema && !avisoEnviado };
}

// --------------------------------------------------------------------------- conexiones reales
const ejecutar = promisify(execFile);
export async function consultarPsql(sql, url = process.env.URL_BASE) {
  const { stdout } = await ejecutar('psql', [url, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { timeout: 60000 });
  const t = stdout.trim();
  return t ? JSON.parse(t.split('\n').pop()) : null;
}

function python(entrada) {
  return new Promise((resolver, rechazar) => {
    const p = spawn('python3', [path.join(RAIZ, 'herramientas/revision/correo.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(err.trim().split('\n').pop() || `código ${codigo}`))));
    p.stdin.end(JSON.stringify(entrada));
  });
}
export const probarCorreoGmail = (de, clave) => python({ accion: 'probar', de, clave });
export const enviarCorreoGmail = (c) => python({ accion: 'enviar', ...c });

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const archivo = path.join(RAIZ, 'config/instalacion.json');
  const instalacion = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : null;
  const res = await revisar({ env: process.env, instalacion, consultar: (q) => consultarPsql(q), probarCorreo: probarCorreoGmail, enviarCorreo: enviarCorreoGmail });
  const icono = { ok: '✅', aviso: '🟡', problema: '🔴' };
  const resumen = ['## Revisión diaria', '', ...res.resultados.map((x) => `- ${icono[x.estado]} **${x.titulo}**${x.detalle ? `: ${x.detalle}` : ''}${x.queHacer ? `<br>Qué hacer: ${x.queHacer}` : ''}`), '', res.correo ? `Correo: ${res.correo}` : 'Todo en orden: no hizo falta avisar por correo.'];
  console.log(resumen.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resumen.join('\n')}\n`);
  if (res.fallar) {
    console.log('::error::Hay un problema y no se pudo avisar por correo. Mirá el resumen de esta ejecución.');
    process.exit(1);
  }
}
