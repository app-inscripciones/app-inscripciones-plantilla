import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, guardarInscripcion, guardarAjuste, nuevoId } from './db.js';
import { sincronizar, recuperarEnvioInterrumpido, claveTokenSesion } from './sincronizacion.js';

const SESION = 'ses-ana';
const ins = (extra = {}) => ({
  id: nuevoId(), eventoId: 'congreso-prueba', cargador: 'Ana', sesionId: SESION, creadaEn: new Date().toISOString(),
  diaCarga: '2026-10-11', estado: 'pendiente', categoria: 'jovenes', datos: { nombre: 'X', dni: '30111222' },
  conceptos: [], monto: 3500, pago: { medio: 'efectivo' }, ...extra,
});

// Servidor simulado: guarda por id (como la base real) y controla la llave del celular.
function servidorFalso({ token = 'llave-buena', caido = false } = {}) {
  const guardadas = new Map();
  const llamadas = [];
  const fn = async (url, opciones) => {
    if (caido) throw new TypeError('Failed to fetch');
    const cuerpo = JSON.parse(opciones.body);
    llamadas.push({ url, cuerpo });
    let res;
    if (cuerpo.p_token !== token) res = { ok: false, error: 'sesion_invalida' };
    else if (guardadas.has(cuerpo.p.id)) res = { ok: true, numeroOrden: guardadas.get(cuerpo.p.id), repetida: true };
    else { guardadas.set(cuerpo.p.id, guardadas.size + 1); res = { ok: true, numeroOrden: guardadas.size, repetida: false }; }
    return { ok: true, json: async () => res };
  };
  return { fn, guardadas, llamadas };
}

describe('Envío a la base central', () => {
  beforeEach(async () => {
    await db.inscripciones.clear();
    await db.ajustes.clear();
    await guardarAjuste(claveTokenSesion(SESION), 'llave-buena');
  });

  it('envía las pendientes con la llave de su acceso y quedan «sincronizado» con número de orden', async () => {
    const a = ins(); const b = ins();
    await guardarInscripcion(a); await guardarInscripcion(b);
    const srv = servidorFalso();
    const r = await sincronizar(srv.fn);
    expect(r.enviadas).toBe(2);
    const guardadaA = await db.inscripciones.get(a.id);
    expect(guardadaA.estado).toBe('sincronizado');
    expect(guardadaA.numeroOrden).toBeGreaterThan(0);
    expect(srv.llamadas[0].url).toMatch(/rpc\/enviar_inscripcion_y_presente$/);
    expect(srv.llamadas[0].cuerpo.p_token).toBe('llave-buena');
    expect(srv.llamadas[0].cuerpo.p.dispositivo).toBeTruthy();
    expect(srv.llamadas[0].cuerpo.p.estado).toBeUndefined();
  });

  it('sin internet quedan «pendiente» y no se pierde nada', async () => {
    const a = ins();
    await guardarInscripcion(a);
    const r = await sincronizar(servidorFalso({ caido: true }).fn);
    expect(r.sinConexion).toBe(true);
    expect((await db.inscripciones.get(a.id)).estado).toBe('pendiente');
  });

  it('reintentar muchas veces no duplica en el servidor', async () => {
    const a = ins();
    await guardarInscripcion(a);
    const srv = servidorFalso();
    await sincronizar(srv.fn);
    await db.inscripciones.update(a.id, { estado: 'pendiente' }); // simula que se perdió la respuesta
    await sincronizar(srv.fn);
    await sincronizar(srv.fn);
    expect(srv.guardadas.size).toBe(1);
    expect((await db.inscripciones.get(a.id)).estado).toBe('sincronizado');
  });

  it('cada inscripción usa la llave de SU acceso, aunque después se haya activado otro QR', async () => {
    await guardarAjuste(claveTokenSesion('ses-vieja'), 'llave-vieja');
    const vieja = ins({ sesionId: 'ses-vieja' });
    await guardarInscripcion(vieja);
    const srv = servidorFalso({ token: 'llave-vieja' });
    await sincronizar(srv.fn);
    expect(srv.llamadas[0].cuerpo.p_token).toBe('llave-vieja');
    expect((await db.inscripciones.get(vieja.id)).estado).toBe('sincronizado');
  });

  it('llave rechazada: queda en «error» (no se borra) y no insiste', async () => {
    const a = ins();
    await guardarInscripcion(a);
    const srv = servidorFalso({ token: 'otra' });
    await sincronizar(srv.fn);
    const g = await db.inscripciones.get(a.id);
    expect(g.estado).toBe('error');
    expect(g.error).toBe('sesion_invalida');
    await sincronizar(srv.fn);
    expect(srv.llamadas).toHaveLength(1);
  });

  it('sin llave guardada (inscripción sin acceso): queda en «error», sin llamar al servidor', async () => {
    const a = ins({ sesionId: undefined });
    await guardarInscripcion(a);
    const srv = servidorFalso();
    await sincronizar(srv.fn);
    expect((await db.inscripciones.get(a.id)).estado).toBe('error');
    expect(srv.llamadas).toHaveLength(0);
  });

  it('si la app se cerró mientras enviaba, vuelve a «pendiente»', async () => {
    const a = ins({ estado: 'enviando' });
    await guardarInscripcion(a);
    await recuperarEnvioInterrumpido();
    expect((await db.inscripciones.get(a.id)).estado).toBe('pendiente');
  });
});
