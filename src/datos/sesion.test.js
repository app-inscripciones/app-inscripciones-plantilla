import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, guardarInscripcion, leerAjuste, nuevoId } from './db.js';
import { extraerCodigo, estadoAcceso, activarAcceso, actualizarEstadoSesion, terminarAcceso, claveToken, leerSesion, dejarAcceso } from './sesion.js';

describe('Código del QR', () => {
  it('lo saca del enlace del QR', () => {
    expect(extraerCodigo('https://inscripciones-iglesia.pages.dev/?a=K7P4-M2QX')).toBe('K7P4-M2QX');
  });
  it('acepta el código escrito en minúsculas, sin guion o con espacios', () => {
    expect(extraerCodigo('k7p4m2qx')).toBe('K7P4-M2QX');
    expect(extraerCodigo(' K7P4 M2QX ')).toBe('K7P4-M2QX');
  });
  it('un enlace sin código devuelve vacío', () => {
    expect(extraerCodigo('https://inscripciones-iglesia.pages.dev/')).toBe('');
  });
});

describe('Horario del acceso', () => {
  const s = { desde: '2026-11-01T12:00:00Z', hasta: '2026-11-01T18:00:00Z', cerradoEn: null };
  it('antes, durante y después del horario', () => {
    expect(estadoAcceso(s, new Date('2026-11-01T11:59:00Z'))).toBe('antes');
    expect(estadoAcceso(s, new Date('2026-11-01T12:00:00Z'))).toBe('vigente');
    expect(estadoAcceso(s, new Date('2026-11-01T17:59:59Z'))).toBe('vigente');
    expect(estadoAcceso(s, new Date('2026-11-01T18:00:00Z'))).toBe('vencido');
  });
  it('cerrado por el organizador, aunque esté dentro del horario', () => {
    expect(estadoAcceso({ ...s, cerradoEn: '2026-11-01T13:00:00Z' }, new Date('2026-11-01T14:00:00Z'))).toBe('cerrado');
  });
  it('sin acceso', () => {
    expect(estadoAcceso(null)).toBe('sin_acceso');
  });
});

const respuesta = (cuerpo) => async () => ({ ok: true, json: async () => cuerpo });

describe('Activación', () => {
  beforeEach(async () => {
    await db.inscripciones.clear();
    await db.ajustes.clear();
  });

  it('guarda la llave, el evento y el horario para trabajar sin internet', async () => {
    const r = await activarAcceso('k7p4m2qx', respuesta({
      ok: true, token: 'llave', sesionId: 's1', tarea: 'cargar', colaborador: 'Ana Pérez',
      desde: '2026-11-01T12:00:00Z', hasta: '2026-11-01T18:00:00Z', evento: { id: 'congreso-prueba', nombre: 'Congreso' },
    }));
    expect(r.ok).toBe(true);
    expect(await leerAjuste(claveToken('s1'))).toBe('llave');
    const s = await leerSesion();
    expect(s.colaborador).toBe('Ana Pérez');
    expect(s.evento.nombre).toBe('Congreso');
  });

  it('sin internet avisa que hace falta conexión', async () => {
    const r = await activarAcceso('K7P4-M2QX', async () => { throw new TypeError('Failed to fetch'); });
    expect(r).toEqual({ ok: false, error: 'sin_conexion' });
  });

  it('código incompleto: ni siquiera consulta', async () => {
    let llamo = false;
    const r = await activarAcceso('K7P4', async () => { llamo = true; });
    expect(r.error).toBe('codigo_invalido');
    expect(llamo).toBe(false);
  });

  it('pasa el motivo del rechazo (por ejemplo, ya activado en otro celular)', async () => {
    const r = await activarAcceso('K7P4-M2QX', respuesta({ ok: false, error: 'ya_activado' }));
    expect(r.error).toBe('ya_activado');
  });

  it('al activar otro QR borra lo ya enviado y conserva lo pendiente', async () => {
    const base = { eventoId: 'e', cargador: 'Ana', creadaEn: new Date().toISOString(), datos: {}, pago: { medio: 'efectivo' }, monto: 1 };
    await guardarInscripcion({ ...base, id: nuevoId(), estado: 'sincronizado', sesionId: 's1' });
    const pendiente = { ...base, id: nuevoId(), estado: 'pendiente', sesionId: 's1' };
    await guardarInscripcion(pendiente);
    await activarAcceso('AAAA-BBBB', respuesta({ ok: true, token: 't1', sesionId: 's1', tarea: 'cargar', colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} }));
    await activarAcceso('CCCC-DDDD', respuesta({ ok: true, token: 't2', sesionId: 's2', tarea: 'cargar', colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} }));
    const quedan = await db.inscripciones.toArray();
    expect(quedan.map((i) => i.id)).toEqual([pendiente.id]);
    expect(await leerAjuste(claveToken('s1'))).toBe('t1'); // la llave vieja sigue para enviar lo pendiente
  });

  it('se entera del cierre manual del organizador', async () => {
    await activarAcceso('AAAA-BBBB', respuesta({ ok: true, token: 't1', sesionId: 's1', tarea: 'cargar', colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} }));
    const s = await actualizarEstadoSesion(respuesta({ ok: true, desde: 'x', hasta: 'y', cerradoEn: '2026-11-01T13:00:00Z' }));
    expect(s.cerradoEn).toBe('2026-11-01T13:00:00Z');
    expect(estadoAcceso(s)).toBe('cerrado');
  });

  it('terminar el acceso borra lo enviado y la sesión, pero no lo pendiente', async () => {
    await activarAcceso('AAAA-BBBB', respuesta({ ok: true, token: 't1', sesionId: 's1', tarea: 'cargar', colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} }));
    const base = { eventoId: 'e', cargador: 'Ana', creadaEn: new Date().toISOString(), datos: {}, pago: { medio: 'efectivo' }, monto: 1, sesionId: 's1' };
    await guardarInscripcion({ ...base, id: nuevoId(), estado: 'sincronizado' });
    await guardarInscripcion({ ...base, id: nuevoId(), estado: 'pendiente' });
    await terminarAcceso();
    expect(await leerSesion()).toBeNull();
    expect(await db.inscripciones.count()).toBe(1);
  });
});

describe('Carreras entre el envío automático y terminar el acceso', () => {
  beforeEach(async () => {
    await db.inscripciones.clear();
    await db.ajustes.clear();
  });
  it('si el colaborador terminó el acceso mientras se consultaba el estado, no se vuelve a crear', async () => {
    await activarAcceso('AAAA-BBBB', respuesta({ ok: true, token: 't1', sesionId: 's1', tarea: 'cargar', colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} }));
    const lento = async () => { await terminarAcceso(); return { ok: true, json: async () => ({ ok: true, desde: 'x', hasta: 'y', cerradoEn: 'z' }) }; };
    const s = await actualizarEstadoSesion(lento);
    expect(s).toBeNull();
    expect(await leerSesion()).toBeNull();
  });
});

describe('inscripciones cerradas (D46)', () => {
  it('el cargador pasa a solo envío; la puerta no', async () => {
    const { estadoAcceso } = await import('./sesion.js');
    const base = { desde: '2026-10-12T10:00:00Z', hasta: '2026-10-12T20:00:00Z', cerradoEn: null, inscripcionesCerradasEn: '2026-10-12T12:00:00Z' };
    const ahora = new Date('2026-10-12T13:00:00Z');
    expect(estadoAcceso({ ...base, tarea: 'cargar' }, ahora)).toBe('inscripciones_cerradas');
    expect(estadoAcceso({ ...base, tarea: 'presentes' }, ahora)).toBe('vigente');
    expect(estadoAcceso({ ...base, tarea: 'cargar', inscripcionesCerradasEn: null }, ahora)).toBe('vigente');
  });
});

// D64 · Dejar el acceso (salir o cambiar de QR) sin perder nada.
describe('Dejar el acceso', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  const ok = (sesionId, tarea) => respuestaDejar({ ok: true, token: 't-' + sesionId, sesionId, tarea, colaborador: 'Ana', desde: 'x', hasta: 'y', evento: {} });

  it('cargador: conserva lo pendiente (con su llave) y borra lo enviado', async () => {
    await activarAcceso('AAAA-BBBB', ok('s1', 'cargar'));
    const base = { eventoId: 'e', cargador: 'Ana', creadaEn: new Date().toISOString(), datos: {}, pago: { medio: 'efectivo' }, monto: 1, sesionId: 's1' };
    await guardarInscripcion({ ...base, id: nuevoId(), estado: 'sincronizado' });
    const pend = { ...base, id: nuevoId(), estado: 'pendiente' };
    await guardarInscripcion(pend);
    expect((await dejarAcceso()).ok).toBe(true);
    expect(await leerSesion()).toBeNull();
    expect((await db.inscripciones.toArray()).map((i) => i.id)).toEqual([pend.id]);
    expect(await leerAjuste(claveToken('s1'))).toBe('t-s1');
  });

  it('puerta: con marcas sin enviar no deja salir; enviadas, borra la lista', async () => {
    await activarAcceso('AAAA-BBBB', ok('p1', 'presentes'));
    await db.puerta.put({ id: 'i1', nombre: 'Ana' });
    await db.marcas.put({ id: 'm1', inscripcionId: 'i1', envio: 'pendiente', sesionId: 'p1' });
    const r = await dejarAcceso();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('marcas_pendientes');
    expect(await leerSesion()).not.toBeNull();
    await db.marcas.update('m1', { envio: 'enviada' });
    expect((await dejarAcceso()).ok).toBe(true);
    expect(await db.puerta.count()).toBe(0);
    expect(await db.marcas.count()).toBe(0);
    expect(await leerSesion()).toBeNull();
  });

  it('sin acceso activo no hace nada', async () => {
    expect((await dejarAcceso()).ok).toBe(true);
  });
});

function respuestaDejar(cuerpo) {
  return async () => ({ ok: true, json: async () => cuerpo });
}
