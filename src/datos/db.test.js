import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, guardarInscripcion, resumenCargador, nuevoId } from './db.js';

const base = (medio, monto, extra = {}) => ({
  id: nuevoId(),
  eventoId: 'congreso-prueba',
  cargador: 'Ana',
  creadaEn: new Date().toISOString(),
  estado: 'pendiente',
  monto,
  pago: { medio },
  ...extra,
});

describe('Guardado en el dispositivo', () => {
  beforeEach(async () => {
    await db.inscripciones.clear();
  });

  it('guarda y confirma la inscripción', async () => {
    const i = base('efectivo', 3500);
    const leida = await guardarInscripcion(i);
    expect(leida.id).toBe(i.id);
  });

  it('no permite guardar dos veces la misma inscripción (mismo id)', async () => {
    const i = base('efectivo', 3500);
    await guardarInscripcion(i);
    await expect(guardarInscripcion(i)).rejects.toThrow();
    expect(await db.inscripciones.count()).toBe(1);
  });

  it('el resumen para rendir suma por medio de pago y no cuenta anuladas', async () => {
    await guardarInscripcion(base('efectivo', 3500));
    await guardarInscripcion(base('efectivo', 6250));
    await guardarInscripcion(base('transferencia', 7000));
    await guardarInscripcion(base('efectivo', 9999, { estado: 'anulada' }));
    await guardarInscripcion(base('efectivo', 1000, { cargador: 'Otro' }));
    const r = await resumenCargador('congreso-prueba', 'Ana');
    expect(r.cantidad).toBe(3);
    expect(r.porMedio.efectivo).toBe(9750);
    expect(r.porMedio.transferencia).toBe(7000);
    expect(r.total).toBe(16750);
    expect(r.pendientes).toBe(3);
  });

  it('lista los cobros con terminal para juntar los tickets (D60), en el orden en que se cargaron', async () => {
    await guardarInscripcion(base('terminal', 5000, { creadaEn: '2026-10-13T15:00:00Z', datos: { nombre: 'Beto' } }));
    await guardarInscripcion(base('terminal', 4000, { creadaEn: '2026-10-13T14:00:00Z', datos: { hombre: 'Juan', mujer: 'Ana' } }));
    await guardarInscripcion(base('terminal', 9000, { estado: 'anulada', datos: { nombre: 'Anulado' } }));
    await guardarInscripcion(base('efectivo', 1000, { datos: { nombre: 'Ceci' } }));
    const r = await resumenCargador('congreso-prueba', 'Ana');
    expect(r.cantidadPorMedio.terminal).toBe(2);
    expect(r.ticketsTerminal.map((t) => [t.nombre, t.monto])).toEqual([['Juan y Ana', 4000], ['Beto', 5000]]);
  });
});
