import { describe, it, expect } from 'vitest';
import { definicionPractica, esPractica, DIAS_PRACTICA } from './practica.js';
import { revisarDefinicion, desdeEvento } from './asistente.js';
import { calcularCobro } from './precios.js';
import { validar } from './validacion.js';

const HOY = '2026-10-13';

describe('evento de práctica (D56)', () => {
  const def = definicionPractica(HOY);

  it('dura una semana desde hoy y toma asistencia una vez por día', () => {
    expect(def.fecha).toBe(HOY);
    expect(def.fechaFin).toBe('2026-10-19');
    expect(def.asistencia.instancias).toHaveLength(DIAS_PRACTICA);
    expect(def.asistencia.instancias[0].fecha).toBe(HOY);
  });

  it('pasa los mismos controles que un evento real', () => {
    const b = { ...desdeEvento(def), nombre: def.nombre, fecha: def.fecha, fechaFin: def.fechaFin };
    const { errores } = revisarDefinicion(b, HOY);
    expect(errores).toEqual([]);
  });

  it('el precio cambia según la categoría y el transporte se cobra aparte', () => {
    const evento = { ...def, id: 'practica' };
    const joven = { nombre: 'Ana Pérez', dni: '30111222', telefono: '3624111222', edad: '20', categoria: 'jovenes', transporte: 'si', restricciones: 'no' };
    expect(calcularCobro(evento, joven, HOY).total).toBe(3500);
    expect(calcularCobro(evento, { ...joven, categoria: 'ninos', edad: '8', transporte: 'no' }, HOY).total).toBe(1000);
    expect(validar(evento, joven, { medio: 'efectivo' })).toEqual({});
  });

  it('pide lo que se practica en un evento real: DNI, teléfono, edad y un dato de salud', () => {
    const ids = def.campos.map((c) => c.id);
    for (const id of ['nombre', 'dni', 'telefono', 'edad', 'transporte', 'restricciones', 'restricciones_cuales']) expect(ids).toContain(id);
    expect(def.campos.find((c) => c.id === 'restricciones').sensible).toBe(true);
  });

  it('esPractica reconoce la marca', () => {
    expect(esPractica({ practica: true })).toBe(true);
    expect(esPractica({})).toBe(false);
    expect(esPractica(null)).toBe(false);
  });
});
