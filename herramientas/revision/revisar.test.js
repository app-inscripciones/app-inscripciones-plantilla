import { describe, it, expect } from 'vitest';
import { revisar, hayQueAvisar, armarCorreo, versionCodigo, revisarEspacio, revisarVersion } from './revisar.mjs';

const AHORA = new Date('2026-10-13T12:00:00Z');
const hace = (horas) => new Date(AHORA - horas * 3600000).toISOString();
const INST = { institucion: 'Club de prueba', correo: 'club@gmail.com', app: { url: 'https://club.pages.dev' },
  supabase: { real: { nombre: 'club-real', ref: 'aaa' }, pruebas: { nombre: 'club-pruebas', ref: 'bbb' } } };
const ENV = { GITHUB_TOKEN: 'g', GITHUB_REPOSITORY: 'club/app-inscripciones', SUPABASE_ACCESS_TOKEN: 's', CLOUDFLARE_API_TOKEN: 'c', GMAIL_CLAVE_APLICACION: 'abcd efgh ijkl mnop' };

// Servicios simulados: cada prueba cambia solo lo que le interesa.
function simulados(o = {}) {
  const s = {
    respaldo: [{ status: 'completed', conclusion: 'success', created_at: hace(5) }],
    supabase: { aaa: 'ACTIVE_HEALTHY', bbb: 'ACTIVE_HEALTHY' },
    supabaseStatus: 200,
    cloudflare: { status: 'active' },
    base: { version: versionCodigo(), espacioUsado: 20 * 1048576, espacioLimite: 500 * 1048576, responsables: ['ana@gmail.com'] },
    anteriores: [],
    correoOk: true,
    ...o,
  };
  const enviados = [];
  const guardado = [];
  const fetchFn = async (url) => {
    const json = (status, cuerpo) => ({ status, ok: status < 300, json: async () => cuerpo });
    if (url.includes('api.github.com')) return json(200, { workflow_runs: s.respaldo });
    if (url.includes('api.supabase.com')) {
      if (s.supabaseStatus !== 200) return json(s.supabaseStatus, {});
      return json(200, { status: s.supabase[url.split('/').pop()] });
    }
    if (url.includes('cloudflare')) return s.cloudflare ? json(200, { success: true, result: s.cloudflare }) : json(401, { success: false });
    throw new Error(`url inesperada ${url}`);
  };
  const consultar = async (sql) => {
    if (sql.includes('revision_base')) { if (!s.base) throw new Error('connection refused'); return s.base; }
    if (sql.includes('from public.revisiones')) return s.anteriores;
    if (sql.includes('registrar_revision')) { guardado.push(sql); return []; }
    throw new Error(`sql inesperado ${sql}`);
  };
  const probarCorreo = async () => { if (!s.correoOk) throw new Error('Google no aceptó la contraseña de aplicación'); };
  const enviarCorreo = async (c) => { enviados.push(c); };
  return { args: { env: ENV, instalacion: INST, consultar, fetchFn, probarCorreo, enviarCorreo, ahora: AHORA }, enviados, guardado };
}
const estado = (res, id) => (res.resultados.find((x) => x.id === id) || {}).estado;

describe('revisión diaria (D58)', () => {
  it('todo en orden: guarda la revisión y no manda correo', async () => {
    const s = simulados();
    const res = await revisar(s.args);
    expect(res.resultados.every((x) => x.estado === 'ok')).toBe(true);
    expect(res.resultados.map((x) => x.id)).toEqual(expect.arrayContaining(['base', 'respaldo', 'llave_supabase', 'llave_cloudflare', 'version', 'espacio', 'correo']));
    expect(s.enviados).toHaveLength(0);
    expect(s.guardado).toHaveLength(1);
    expect(res.fallar).toBe(false);
  });

  it('respaldo que falló: problema, correo a los Responsables y al Gmail, en castellano y con qué hacer', async () => {
    const s = simulados({ respaldo: [{ status: 'completed', conclusion: 'failure', created_at: hace(4) }] });
    const res = await revisar(s.args);
    expect(estado(res, 'respaldo')).toBe('problema');
    expect(s.enviados).toHaveLength(1);
    expect(s.enviados[0].para).toEqual(['ana@gmail.com', 'club@gmail.com']);
    expect(s.enviados[0].asunto).toMatch(/problema/);
    expect(s.enviados[0].texto).toMatch(/El último respaldo falló[\s\S]*Qué hacer:[\s\S]*Run workflow/);
    expect(s.enviados[0].texto).toMatch(/club\.pages\.dev\/#panel/);
    expect(res.correo).toMatch(/Aviso enviado/);
    expect(res.fallar).toBe(false);
  });

  it('respaldo que dejó de correr (GitHub lo desactivó o algo lo frena)', async () => {
    const res = await revisar(simulados({ respaldo: [{ status: 'completed', conclusion: 'success', created_at: hace(80) }] }).args);
    const x = res.resultados.find((y) => y.id === 'respaldo');
    expect(x.estado).toBe('problema');
    expect(x.titulo).toMatch(/no corre hace 3 días/);
    expect(x.queHacer).toMatch(/Enable workflow/);
  });

  it('base real pausada y base de pruebas pausada', async () => {
    const res = await revisar(simulados({ supabase: { aaa: 'INACTIVE', bbb: 'PAUSING' } }).args);
    expect(estado(res, 'supabase_real')).toBe('problema');
    expect(estado(res, 'supabase_pruebas')).toBe('aviso');
    expect(res.resultados.find((x) => x.id === 'supabase_real').queHacer).toMatch(/Resume project/);
  });

  it('la base no responde: problema, y no se puede guardar en la base pero sí avisar por correo', async () => {
    const s = simulados({ base: null });
    const res = await revisar(s.args);
    expect(estado(res, 'base')).toBe('problema');
    expect(s.guardado).toHaveLength(0);
    expect(s.enviados[0].para).toEqual(['club@gmail.com']);
  });

  it('llave de Supabase vencida o borrada', async () => {
    const res = await revisar(simulados({ supabaseStatus: 401 }).args);
    expect(estado(res, 'llave_supabase')).toBe('problema');
    expect(res.resultados.find((x) => x.id === 'llave_supabase').queHacer).toMatch(/SUPABASE_ACCESS_TOKEN/);
  });

  it('llave de Cloudflare: por vencer (aviso), por vencer en una semana (problema), inválida (problema)', async () => {
    const en = (dias) => new Date(+AHORA + dias * 86400000).toISOString();
    expect(estado(await revisar(simulados({ cloudflare: { status: 'active', expires_on: en(20) } }).args), 'llave_cloudflare')).toBe('aviso');
    expect(estado(await revisar(simulados({ cloudflare: { status: 'active', expires_on: en(5) } }).args), 'llave_cloudflare')).toBe('problema');
    expect(estado(await revisar(simulados({ cloudflare: { status: 'active', expires_on: en(200) } }).args), 'llave_cloudflare')).toBe('ok');
    expect(estado(await revisar(simulados({ cloudflare: null }).args), 'llave_cloudflare')).toBe('problema');
  });

  it('un aviso se manda por correo una sola vez; un problema, todos los días', async () => {
    const enCurso = (await revisar(simulados({ base: { version: versionCodigo() - 1, espacioUsado: 1, espacioLimite: 500, responsables: [] } }).args)).resultados;
    expect(hayQueAvisar(enCurso, [])).toBe(true);
    expect(hayQueAvisar(enCurso, enCurso)).toBe(false);
    const conProblema = [...enCurso, { id: 'respaldo', estado: 'problema', titulo: 'x' }];
    expect(hayQueAvisar(conProblema, conProblema)).toBe(true);
  });

  it('el Gmail no puede mandar: problema, y la revisión termina con error para que GitHub avise', async () => {
    const s = simulados({ correoOk: false });
    const res = await revisar(s.args);
    expect(estado(res, 'correo')).toBe('problema');
    expect(s.enviados).toHaveLength(0);
    expect(res.fallar).toBe(true);
  });

  it('versión de la base y espacio', () => {
    expect(revisarVersion({ version: 10 }, 16).estado).toBe('aviso');
    expect(revisarVersion({ version: 16 }, 16).estado).toBe('ok');
    expect(revisarEspacio({ espacioUsado: 410, espacioLimite: 500 }).estado).toBe('aviso');
    expect(revisarEspacio({ espacioUsado: 480, espacioLimite: 500 }).estado).toBe('problema');
    expect(versionCodigo()).toBeGreaterThanOrEqual(16);
  });

  it('el correo solo nombra lo que hay que mirar y resume lo que está bien', () => {
    const { asunto, texto } = armarCorreo([
      { id: 'a', estado: 'ok', titulo: 'Respaldo diario' },
      { id: 'b', estado: 'aviso', titulo: 'La llave de Cloudflare vence en 20 días', detalle: 'd', queHacer: 'q' },
    ], { institucion: 'Club', urlApp: 'https://x.pages.dev' });
    expect(asunto).toMatch(/algo para revisar/);
    expect(texto).toMatch(/🟡 La llave de Cloudflare/);
    expect(texto).toMatch(/Lo demás está en orden: respaldo diario/);
    expect(texto).not.toMatch(/undefined/);
  });
});
