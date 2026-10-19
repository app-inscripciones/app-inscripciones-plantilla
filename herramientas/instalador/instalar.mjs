// Etapa 8 · Instalador automático (D34).
// Lo corre GitHub Actions (workflow «Instalar») en la copia de la institución. Hace, en orden:
//   1. Cloudflare Pages: crea el proyecto donde se publica la app (si no existe) y averigua su dirección.
//   2. Supabase: crea las bases «<nombre>-real» y «<nombre>-pruebas» (si no existen) y espera que estén listas.
//   3. Carga las tablas y funciones (supabase/001, 003 a 010) en las dos bases.
//   4. Da de alta al primer Responsable general (si todavía no hay uno).
//   5. Configura el ingreso con código por correo: SMTP de Gmail, plantillas, dirección de la app y el hook.
//   6. Escribe config/conexion.json, config/institucion.json y config/instalacion.json (datos públicos).
// Se puede correr más de una vez: lo que ya existe se reutiliza.
//
// Variables de entorno (las secretas vienen de los «secrets» del repositorio; nunca se muestran):
//   SUPABASE_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, CLAVE_RESPALDO, GMAIL_CLAVE_APLICACION   (secretas)
//   NOMBRE_INSTITUCION, CORREO_PROYECTO, CORREO_RESPONSABLE, NOMBRE_RESPONSABLE           (del formulario «Instalar»)
//   CLOUDFLARE_ACCOUNT_ID, SUPABASE_ORG, REGION (opcionales)
//   Caso testigo (D73, workflow «Base real (caso testigo)»): URL_APP_FIJA (la app ya se publica sola desde GitHub en
//   Cloudflare: no se toca Cloudflare ni hace falta su llave), PREFIJO_BASES (nombre de las bases que ya existen) y
//   COPIAR_DE_PRUEBAS=1 (copia de la base de pruebas a la real los datos de la institución y la práctica hecha).
//   SUPABASE_API, CLOUDFLARE_API (solo para pruebas con un servidor simulado)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ARCHIVOS_SQL = [
  '001_base.sql', '003_accesos_qr.sql', '004_usuarios.sql', '005_panel_control.sql', '006_gestion.sql',
  '007_presentes.sql', '008_institucion.sql', '009_asistente_eventos.sql', '010_cierre_y_sin_cobro.sql', '011_permisos.sql', '012_control_monto.sql', '013_categorias.sql',
  '014_practica.sql', '015_modalidad.sql', '016_revision.sql', '017_tickets.sql', '018_grupos.sql', '019_autopresente.sql', '020_borrar_archivar.sql', '021_practica_previa.sql', '022_baja_clave_organizador.sql',
];

// «Iglesia Bautista Central» → «iglesia-bautista-central» (máx. 30 letras).
export function nombreCorto(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'institucion';
}

// La contraseña de cada base no se guarda en ningún lado: se calcula a partir de la clave de respaldo.
// Así el respaldo diario la puede volver a calcular sin otro secret.
export function claveBase(claveRespaldo, nombreProyecto) {
  return createHmac('sha256', claveRespaldo).update(`base:${nombreProyecto}`).digest('base64url').slice(0, 32);
}

export function textoCorreo() {
  return '<h2>Tu código para ingresar</h2><p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>'
    + '<p>Vence en 1 hora. Si no lo pediste, ignorá este correo.</p>';
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function cliente(base, token, nombre, fetchFn) {
  return async (metodo, ruta, cuerpo, { permitir404 = false } = {}) => {
    for (let intento = 1; ; intento++) {
      let r;
      try {
        r = await fetchFn(`${base}${ruta}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
      } catch (e) {
        if (intento < 4) { await esperar(3000 * intento); continue; }
        throw new Error(`${nombre}: no se pudo conectar (${e.message}).`);
      }
      if (permitir404 && r.status === 404) return null;
      const texto = await r.text();
      if ((r.status === 429 || r.status >= 500) && intento < 4) { await esperar(5000 * intento); continue; }
      if (!r.ok) {
        let pista = r.status === 401 || r.status === 403 ? ' Revisá que la llave esté bien copiada y tenga los permisos del manual.' : '';
        if (nombre === 'Cloudflare' && /verif/i.test(texto)) pista = ' Falta verificar la cuenta de Cloudflare: abrí el Gmail, buscá el correo de Cloudflare y tocá «Verify email» (manual, paso 5, punto 2). Después volvé a instalar.';
        throw new Error(`${nombre} respondió ${r.status} en ${metodo} ${ruta}: ${texto.slice(0, 300)}.${pista}`);
      }
      return texto ? JSON.parse(texto) : null;
    }
  };
}

// Carga (o vuelve a cargar) todos los archivos SQL en las bases indicadas. Todos se pueden ejecutar más de una vez.
export async function cargarTablas(sb, bases, raiz = RAIZ, log = console.log) {
  for (const b of bases) {
    for (const archivo of ARCHIVOS_SQL) {
      const sql = readFileSync(path.join(raiz, 'supabase', archivo), 'utf8');
      await sb('POST', `/v1/projects/${b.ref}/database/query`, { query: sql });
    }
    log(`    ${b.nombre}: listo`);
  }
}

export async function instalar(env, { fetchFn = fetch, log = console.log, pausa = 10000, raiz = RAIZ } = {}) {
  const fija = String(env.URL_APP_FIJA || '').trim().replace(/\/+$/, '');
  const falta = ['SUPABASE_ACCESS_TOKEN', ...(fija ? [] : ['CLOUDFLARE_API_TOKEN']), 'CLAVE_RESPALDO', 'GMAIL_CLAVE_APLICACION',
    'NOMBRE_INSTITUCION', 'CORREO_PROYECTO', 'CORREO_RESPONSABLE', 'NOMBRE_RESPONSABLE'].filter((k) => !String(env[k] || '').trim());
  if (falta.length) {
    const FORM = { NOMBRE_INSTITUCION: 'nombre de la institución', CORREO_PROYECTO: 'Gmail de la institución', CORREO_RESPONSABLE: 'correo del Responsable general', NOMBRE_RESPONSABLE: 'nombre y apellido del Responsable general' };
    const claves = falta.filter((k) => !FORM[k]);
    const datos = falta.filter((k) => FORM[k]).map((k) => FORM[k]);
    throw new Error(['Faltan datos:', claves.length ? ` claves en GitHub (manual de instalación, paso 6; el nombre tiene que estar escrito exactamente igual): ${claves.join(', ')}.` : '',
      datos.length ? ` Casilleros del panel de «Instalar» sin completar: ${datos.join(', ')}.` : ''].join(''));
  }
  if (env.CLAVE_RESPALDO.length < 16) throw new Error('La CLAVE_RESPALDO tiene que tener al menos 16 caracteres.');
  const correo = (c) => String(c).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo(env.CORREO_RESPONSABLE))) throw new Error('El correo del Responsable general no es válido.');

  const corto = nombreCorto(env.NOMBRE_INSTITUCION);
  const prefijoBases = env.PREFIJO_BASES ? nombreCorto(env.PREFIJO_BASES) : corto;
  const region = env.REGION || 'sa-east-1';
  const sb = cliente(env.SUPABASE_API || 'https://api.supabase.com', env.SUPABASE_ACCESS_TOKEN, 'Supabase', fetchFn);
  const cf = cliente(env.CLOUDFLARE_API || 'https://api.cloudflare.com/client/v4', env.CLOUDFLARE_API_TOKEN, 'Cloudflare', fetchFn);

  // 1. Cloudflare Pages ----------------------------------------------------------
  log('1/6 Cloudflare: proyecto de publicación');
  let cuenta = null;
  let nombrePages = null;
  let urlApp;
  if (fija) {
    urlApp = fija;
    log(`    La app ya se publica sola desde GitHub en ${urlApp}: no se toca Cloudflare.`);
  } else {
    cuenta = env.CLOUDFLARE_ACCOUNT_ID;
    if (!cuenta) {
      let r;
      try {
        r = await cf('GET', '/accounts');
      } catch (e) {
        throw new Error(`${e.message} Si la llave no puede ver la cuenta, agregá el secret CLOUDFLARE_ACCOUNT_ID (Cloudflare → página principal → «Account ID»).`);
      }
      if (!r.result || r.result.length === 0) throw new Error('Cloudflare: la llave no tiene acceso a ninguna cuenta.');
      cuenta = r.result[0].id;
    }
    nombrePages = `inscripciones-${corto}`.slice(0, 58);
    let pages = await cf('GET', `/accounts/${cuenta}/pages/projects/${nombrePages}`, undefined, { permitir404: true });
    if (!pages) pages = await cf('POST', `/accounts/${cuenta}/pages/projects`, { name: nombrePages, production_branch: 'main' });
    const sub = (pages.result && pages.result.subdomain) || `${nombrePages}.pages.dev`;
    urlApp = `https://${sub}`;
    log(`    La app va a estar en ${urlApp}`);
  }

  // 2. Supabase: las dos bases ----------------------------------------------------
  log('2/6 Supabase: bases real y de pruebas');
  let org = env.SUPABASE_ORG;
  if (!org) {
    const orgs = await sb('GET', '/v1/organizations');
    if (!orgs || orgs.length === 0) throw new Error('Supabase: no hay ninguna organización. Entrá una vez a supabase.com con GitHub.');
    org = orgs[0].slug || orgs[0].id;
  }
  const existentes = await sb('GET', '/v1/projects');
  const bases = {};
  for (const tipo of ['real', 'pruebas']) {
    const nombre = `${prefijoBases}-${tipo}`.slice(0, 40);
    const clave = claveBase(env.CLAVE_RESPALDO, nombre);
    let p = existentes.find((x) => x.name === nombre);
    if (!p) {
      log(`    Creando ${nombre}…`);
      try {
        p = await sb('POST', '/v1/projects', { name: nombre, organization_slug: org, db_pass: clave, region });
      } catch (e) {
        if (/limit|maximum|max(imum)? number|free project|402/i.test(e.message)) {
          throw new Error('Supabase no deja crear más bases gratis en esta organización (el plan gratuito permite 2 activas). '
            + 'Si creaste un proyecto a mano, borralo: supabase.com → abrí ese proyecto → Project Settings → General → abajo de todo, Delete project. '
            + 'Después volvé a tocar «Instalar». (Nunca elijas un plan pago.)');
        }
        throw e;
      }
    } else {
      log(`    ${nombre} ya existía: se reutiliza.`);
    }
    bases[tipo] = { nombre, ref: p.ref, clave };
  }
  for (const tipo of ['real', 'pruebas']) {
    const b = bases[tipo];
    for (let i = 0; ; i++) {
      const p = await sb('GET', `/v1/projects/${b.ref}`);
      if (p.status === 'ACTIVE_HEALTHY') break;
      if (['INIT_FAILED', 'REMOVED', 'RESTORE_FAILED'].includes(p.status)) throw new Error(`Supabase: la base ${b.nombre} quedó en estado ${p.status}.`);
      if (p.status === 'INACTIVE') {
        // El plan gratuito pausa una base sin uso: se reactiva sola (lo mismo que el botón «Resume project»).
        if (b.reactivada === undefined) {
          log(`    ${b.nombre} estaba pausada: reactivándola (tarda unos minutos)…`);
          await sb('POST', `/v1/projects/${b.ref}/restore`, {});
          b.reactivada = 0;
        } else if (++b.reactivada > 12) {
          throw new Error(`Supabase: la base ${b.nombre} sigue pausada. Reanudala desde supabase.com (Resume project) y volvé a instalar.`);
        }
        await esperar(pausa);
        continue;
      }
      if (i > 90) throw new Error(`Supabase: la base ${b.nombre} tardó demasiado en estar lista. Volvé a tocar «Instalar» en unos minutos.`);
      if (i === 0) log(`    Esperando que ${b.nombre} esté lista (puede tardar unos minutos)…`);
      await esperar(pausa);
    }
    // Deja la contraseña igual a la calculada (por si la base ya existía con otra).
    await sb('PATCH', `/v1/projects/${b.ref}/database/password`, { password: b.clave });
  }

  // 3. Tablas y funciones --------------------------------------------------------
  log('3/6 Cargando tablas y funciones');
  await cargarTablas(sb, [bases.real, bases.pruebas], raiz, log);

  // 4. Primer Responsable general -------------------------------------------------
  log('4/6 Primer Responsable general');
  const esc = (t) => String(t).replace(/'/g, "''");
  for (const tipo of ['real', 'pruebas']) {
    await sb('POST', `/v1/projects/${bases[tipo].ref}/database/query`, {
      query: `select public.alta_primer_responsable('${esc(correo(env.CORREO_RESPONSABLE))}', '${esc(env.NOMBRE_RESPONSABLE.trim())}')
              where not exists (select 1 from public.roles_usuario where rol = 'responsable');`,
    });
  }

  // 4 bis. Caso testigo: lo que ya se cargó en la base de pruebas pasa a la real (sin pisar nada)
  if (env.COPIAR_DE_PRUEBAS === '1') {
    log('    Copiando de la base de pruebas a la real: datos de la institución y práctica hecha');
    const q = (ref, query) => sb('POST', `/v1/projects/${ref}/database/query`, { query });
    const inst = await q(bases.pruebas.ref, 'select row_to_json(i)::text as fila from public.institucion i where id = 1');
    if (inst && inst[0] && inst[0].fila) {
      await q(bases.real.ref, `insert into public.institucion select * from json_populate_record(null::public.institucion, '${esc(inst[0].fila)}'::json) on conflict (id) do nothing`);
    }
    const pr = await q(bases.pruebas.ref, `select coalesce(json_agg(p), '[]'::json)::text as filas from public.practicas_hechas p where lower(p.correo) = lower('${esc(correo(env.CORREO_RESPONSABLE))}')`);
    if (pr && pr[0] && pr[0].filas && pr[0].filas !== '[]') {
      await q(bases.real.ref, `insert into public.practicas_hechas select * from json_populate_recordset(null::public.practicas_hechas, '${esc(pr[0].filas)}'::json) on conflict do nothing`);
    }
  }

  // 5. Ingreso con código por correo ---------------------------------------------
  log('5/6 Correo de ingreso (Gmail) y control de altas');
  const auth = {
    site_url: urlApp,
    uri_allow_list: `${urlApp}/**`,
    external_email_enabled: true,
    mailer_otp_exp: 3600,
    mailer_otp_length: 6,
    smtp_admin_email: correo(env.CORREO_PROYECTO),
    smtp_host: 'smtp.gmail.com',
    smtp_port: '465',
    smtp_user: correo(env.CORREO_PROYECTO),
    smtp_pass: env.GMAIL_CLAVE_APLICACION.replace(/\s+/g, ''),
    smtp_sender_name: 'Inscripciones',
    mailer_subjects_magic_link: 'Tu código para ingresar',
    mailer_templates_magic_link_content: textoCorreo(),
    mailer_subjects_confirmation: 'Tu código para ingresar',
    mailer_templates_confirmation_content: textoCorreo(),
    hook_before_user_created_enabled: true,
    hook_before_user_created_uri: 'pg-functions://postgres/public/hook_antes_de_crear_usuario',
  };
  for (const tipo of ['real', 'pruebas']) await sb('PATCH', `/v1/projects/${bases[tipo].ref}/config/auth`, auth);

  // 6. Archivos de configuración (datos públicos) ---------------------------------
  log('6/6 Configuración de la app');
  const llaves = await sb('GET', `/v1/projects/${bases.real.ref}/api-keys?reveal=true`);
  const publica = (llaves || []).find((k) => k.type === 'publishable') || (llaves || []).find((k) => k.name === 'anon');
  if (!publica || !publica.api_key) throw new Error('Supabase: no se encontró la clave pública de la base real.');
  const conexion = {
    _ayuda: 'Base central a la que envía la app. Son datos PÚBLICOS (la seguridad la dan las reglas de la base). Lo escribe el instalador.',
    entorno: 'real',
    url: `https://${bases.real.ref}.supabase.co`,
    clavePublica: publica.api_key,
  };
  writeFileSync(path.join(raiz, 'config/conexion.json'), `${JSON.stringify(conexion, null, 2)}\n`);
  const archivoInst = path.join(raiz, 'config/institucion.json');
  const inst = existsSync(archivoInst) ? JSON.parse(readFileSync(archivoInst, 'utf8')) : {};
  inst._ayuda = 'Valores iniciales de la institución. Los de verdad se cargan desde el panel (Institución).';
  inst.nombreInstitucion = env.NOMBRE_INSTITUCION.trim();
  writeFileSync(archivoInst, `${JSON.stringify(inst, null, 2)}\n`);
  const instalacion = {
    _ayuda: 'Lo escribe el instalador. Datos públicos (sin contraseñas).',
    institucion: env.NOMBRE_INSTITUCION.trim(),
    correo: correo(env.CORREO_PROYECTO),
    plantilla: 'https://github.com/inscripciones-iglesia/app-inscripciones-plantilla.git',
    nombreCorto: corto,
    instaladoEn: new Date().toISOString(),
    app: { url: urlApp, proyectoCloudflare: nombrePages, cuentaCloudflare: cuenta, ...(fija ? { publicacion: 'cloudflare-desde-github' } : {}) },
    supabase: { region, real: { nombre: bases.real.nombre, ref: bases.real.ref }, pruebas: { nombre: bases.pruebas.nombre, ref: bases.pruebas.ref } },
  };
  writeFileSync(path.join(raiz, 'config/instalacion.json'), `${JSON.stringify(instalacion, null, 2)}\n`);

  return { urlApp, nombrePages, cuenta, bases: { real: bases.real.ref, pruebas: bases.pruebas.ref } };
}

// Uso desde GitHub Actions
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const env = process.env;
  try {
    const r = await instalar(env);
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `url_app=${r.urlApp}\nproyecto_pages=${r.nombrePages || ''}\ncuenta_cloudflare=${r.cuenta || ''}\n`);
    }
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, [
        '## ✅ Instalación terminada', '',
        `- **La app:** ${r.urlApp}`,
        `- **El panel:** ${r.urlApp}/#panel  → entrar con **${env.CORREO_RESPONSABLE.trim().toLowerCase()}** (llega un código al correo)`,
        `- **Bases de Supabase:** ${r.bases.real} (real) y ${r.bases.pruebas} (pruebas)`, '',
        'Siguiente paso: entrar al panel, pestaña **Institución**, y cargar el nombre, los colores y el logo.', '',
      ].join('\n'));
    }
    console.log(`\nListo. La app: ${r.urlApp}`);
  } catch (e) {
    console.error(`::error::${e.message}`);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, [
        '## ❌ La instalación no terminó', '',
        `**Qué pasó:** ${e.message}`, '',
        '**Qué hacer:** corregí lo que dice el mensaje y volvé a tocar **Run workflow** (el botón verde de arriba a la derecha y, en el panel, el de abajo de todo). '
          + 'Lo que ya se hizo no se repite ni se pierde. **No** uses «Re-run jobs».', '',
        'Si el mensaje no se entiende, buscalo en el manual de instalación, sección «Si algo sale mal durante la instalación».', '',
      ].join('\n'));
    }
    process.exit(1);
  }
}
