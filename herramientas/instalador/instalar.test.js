import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { instalar, nombreCorto, claveBase, ARCHIVOS_SQL } from './instalar.mjs';
import { urlBase } from './url-base.mjs';
import { apiSimulada, ENV_PRUEBA } from './simulado.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
let raiz;
beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), 'inst-'));
  cpSync(path.join(RAIZ, 'supabase'), path.join(raiz, 'supabase'), { recursive: true });
  mkdirSync(path.join(raiz, 'config'));
  cpSync(path.join(RAIZ, 'config/institucion.json'), path.join(raiz, 'config/institucion.json'));
});
const leer = (f) => JSON.parse(readFileSync(path.join(raiz, f), 'utf8'));
const opciones = (fetchFn) => ({ fetchFn, raiz, pausa: 0, log: () => {} });

describe('instalador (D34)', () => {
  it('nombre corto y clave de la base', () => {
    expect(nombreCorto('Club Atlético Las Palmas')).toBe('club-atletico-las-palmas');
    expect(nombreCorto('  ¡Iglesia!  ')).toBe('iglesia');
    expect(claveBase('x'.repeat(20), 'a-real')).toHaveLength(32);
    expect(claveBase('x'.repeat(20), 'a-real')).not.toBe(claveBase('x'.repeat(20), 'a-pruebas'));
  });

  it('instala todo de punta a punta', async () => {
    const { fetchFn, estado } = apiSimulada();
    const r = await instalar(ENV_PRUEBA, opciones(fetchFn));
    expect(r.urlApp).toBe('https://inscripciones-club-atletico-las-palmas.pages.dev');
    expect(estado.proyectos.map((p) => [p.name, p.region])).toEqual([['club-atletico-las-palmas-real', 'sa-east-1'], ['club-atletico-las-palmas-pruebas', 'sa-east-1']]);
    expect(estado.esperas).toBe(2);
    // Las tablas en las dos bases, en orden, sin los eventos modelo del caso testigo.
    const porBase = (ref) => estado.consultas.filter((c) => c.ref === ref);
    for (const p of estado.proyectos) {
      const q = porBase(p.ref);
      expect(q).toHaveLength(ARCHIVOS_SQL.length + 1);
      expect(q[0].query).toContain('create table if not exists public.eventos');
      expect(q.some((c) => c.query.includes('Congreso de prueba'))).toBe(false);
      expect(q.at(-1).query).toContain("alta_primer_responsable('marta.lopez@gmail.com', 'Marta O''Connor')");
      expect(p.db_pass).toBe(claveBase(ENV_PRUEBA.CLAVE_RESPALDO, p.name));
      const a = estado.auth[p.ref];
      expect(a.site_url).toBe(r.urlApp);
      expect(a.smtp_user).toBe('inscripciones.laspalmas@gmail.com');
      expect(a.smtp_pass).toBe('abcdefghijklmnop');
      expect(a.mailer_templates_magic_link_content).toContain('{{ .Token }}');
      expect(a.hook_before_user_created_uri).toBe('pg-functions://postgres/public/hook_antes_de_crear_usuario');
    }
    const real = estado.proyectos[0].ref;
    expect(leer('config/conexion.json')).toMatchObject({ entorno: 'real', url: `https://${real}.supabase.co`, clavePublica: `sb_publishable_${real}` });
    expect(leer('config/institucion.json').nombreInstitucion).toBe('Club Atlético Las Palmas');
    expect(leer('config/instalacion.json').supabase.pruebas.nombre).toBe('club-atletico-las-palmas-pruebas');
    expect(JSON.stringify(leer('config/instalacion.json'))).not.toContain(ENV_PRUEBA.CLAVE_RESPALDO);
  });

  it('se puede volver a correr: reutiliza lo que ya existe', async () => {
    const { fetchFn, estado } = apiSimulada();
    await instalar(ENV_PRUEBA, opciones(fetchFn));
    await instalar(ENV_PRUEBA, opciones(fetchFn));
    expect(estado.proyectos).toHaveLength(2);
    expect(estado.pages).toHaveLength(1);
  });

  it('usa la dirección que asigna Cloudflare si el nombre estaba ocupado', async () => {
    const { fetchFn } = apiSimulada({ subdominio: 'inscripciones-club-atletico-las-palmas-7xk.pages.dev' });
    const r = await instalar(ENV_PRUEBA, opciones(fetchFn));
    expect(r.urlApp).toBe('https://inscripciones-club-atletico-las-palmas-7xk.pages.dev');
  });

  it('errores claros: faltan secrets, llave mal copiada, clave corta', async () => {
    const { fetchFn } = apiSimulada();
    await expect(instalar({ ...ENV_PRUEBA, GMAIL_CLAVE_APLICACION: '' }, opciones(fetchFn))).rejects.toThrow(/Faltan datos: GMAIL_CLAVE_APLICACION/);
    await expect(instalar({ ...ENV_PRUEBA, CLOUDFLARE_API_TOKEN: 'mal' }, opciones(fetchFn))).rejects.toThrow(/Cloudflare respondió 403.*llave/);
    await expect(instalar({ ...ENV_PRUEBA, SUPABASE_ACCESS_TOKEN: 'mal' }, opciones(fetchFn))).rejects.toThrow(/Supabase respondió 401/);
    await expect(instalar({ ...ENV_PRUEBA, CLAVE_RESPALDO: 'corta' }, opciones(fetchFn))).rejects.toThrow(/16 caracteres/);
  });

  it('el respaldo arma la conexión sin guardar la contraseña', async () => {
    const { fetchFn } = apiSimulada();
    await instalar(ENV_PRUEBA, opciones(fetchFn));
    const url = await urlBase(ENV_PRUEBA, leer('config/instalacion.json'), 'real', fetchFn);
    const ref = leer('config/instalacion.json').supabase.real.ref;
    expect(url).toBe(`postgresql://postgres.${ref}:${claveBase(ENV_PRUEBA.CLAVE_RESPALDO, 'club-atletico-las-palmas-real')}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`);
  });
});

describe('actualizar (P13)', () => {
  it('vuelve a cargar el SQL en las dos bases de una institución instalada', async () => {
    const { actualizarBases } = await import('./actualizar.mjs');
    const { fetchFn, estado } = apiSimulada();
    await instalar(ENV_PRUEBA, opciones(fetchFn));
    const antes = estado.consultas.length;
    const refs = await actualizarBases({ SUPABASE_ACCESS_TOKEN: 'sb-token', SUPABASE_API: 'https://sb.test' }, { fetchFn, raiz, log: () => {} });
    expect(refs).toHaveLength(2);
    expect(estado.consultas.length - antes).toBe(2 * ARCHIVOS_SQL.length);
    expect(estado.proyectos).toHaveLength(2);
  });
  it('avisa si la copia no se instaló con el botón', async () => {
    const { actualizarBases } = await import('./actualizar.mjs');
    await expect(actualizarBases({ SUPABASE_ACCESS_TOKEN: 'x' }, { raiz, log: () => {} })).rejects.toThrow(/instalacion.json/);
  });
});
