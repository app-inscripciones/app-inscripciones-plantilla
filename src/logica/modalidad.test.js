import { describe, it, expect } from 'vitest';
import { nuevoBorrador, cambiarModalidad, cambiarUnidad, armarDefinicion, revisarDefinicion, desdeEvento, resumenSimple } from './asistente.js';
import { calcularCobro } from './precios.js';
import { validar } from './validacion.js';

const HOY = '2026-10-13';
const base = () => ({ ...nuevoBorrador(), nombre: 'Congreso híbrido', fecha: '2026-11-20', conceptos: [{ id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ monto: '5000' }] }] });

describe('modalidad del evento (R18, D57)', () => {
  it('por defecto es presencial y no agrega ninguna pregunta', () => {
    const def = armarDefinicion(base());
    expect(def.modalidad).toBe('presencial');
    expect(def.campos.some((c) => c.id === 'modalidad')).toBe(false);
    expect(def.cupoPresencial).toBeUndefined();
  });

  it('híbrido: agrega «¿Cómo va a participar?» después del nombre, con cupo y cierre', () => {
    const b = { ...cambiarModalidad(base(), 'hibrido'), cupoPresencial: '500', cierrePresencialPct: 95 };
    expect(b.campos[1].id).toBe('modalidad');
    const def = armarDefinicion(b);
    expect(def.campos.find((c) => c.id === 'modalidad')).toMatchObject({ tipo: 'opcion', obligatorio: true });
    expect(def.campos.find((c) => c.id === 'modalidad').opciones.map((o) => o.valor)).toEqual(['presencial', 'virtual']);
    expect(def.cupoPresencial).toBe(500);
    expect(def.cierrePresencialPct).toBe(95);
    expect(armarDefinicion({ ...b, cierrePresencialPct: 0 }).cierrePresencialPct).toBeNull();
    expect(revisarDefinicion(b, HOY).errores).toEqual([]);
  });

  it('en pareja, la pregunta va después de los dos nombres', () => {
    const b = cambiarModalidad(cambiarUnidad(base(), 'pareja'), 'hibrido');
    expect(b.campos.map((c) => c.id).slice(0, 3)).toEqual(['hombre', 'mujer', 'modalidad']);
  });

  it('volver a presencial quita la pregunta y los cobros que dependían de ella', () => {
    let b = cambiarModalidad(base(), 'hibrido');
    b = { ...b, conceptos: [{ id: 'matricula', nombre: 'Matrícula', aplicaSi: { campo: 'modalidad', igual: 'presencial' }, precios: [{ monto: '5000' }] }] };
    b = cambiarModalidad(b, 'presencial');
    expect(b.campos.some((c) => c.id === 'modalidad')).toBe(false);
    expect(b.conceptos[0].aplicaSi).toBeNull();
  });

  it('virtual: no se toma asistencia en la puerta', () => {
    const def = armarDefinicion(cambiarModalidad(base(), 'virtual'));
    expect(def.modalidad).toBe('virtual');
    expect(def.asistencia.toma).toBe(false);
    expect(def.asistencia.instancias).toEqual([]);
    const vuelta = armarDefinicion(cambiarModalidad(cambiarModalidad(base(), 'virtual'), 'presencial'));
    expect(vuelta.asistencia.toma).toBe(true);
  });

  it('el precio puede depender de la modalidad (cobro «solo si elige Presencial»)', () => {
    let b = cambiarModalidad(base(), 'hibrido');
    b = { ...b, conceptos: [
      { id: 'presencial', nombre: 'Matrícula presencial', aplicaSi: { campo: 'modalidad', igual: 'presencial' }, precios: [{ monto: '5000' }] },
      { id: 'virtual', nombre: 'Matrícula virtual', aplicaSi: { campo: 'modalidad', igual: 'virtual' }, precios: [{ monto: '2000' }] },
    ] };
    const ev = { ...armarDefinicion(b), id: 'x' };
    const r = { nombre: 'Ana', dni: '30111222', telefono: '3624111222' };
    expect(calcularCobro(ev, { ...r, modalidad: 'presencial' }, HOY).total).toBe(5000);
    expect(calcularCobro(ev, { ...r, modalidad: 'virtual' }, HOY).total).toBe(2000);
    expect(Object.keys(validar(ev, r, { medio: 'efectivo' }))).toContain('modalidad');
  });

  it('avisa lo que suele olvidarse y rechaza un cupo mal escrito', () => {
    const sinCupo = revisarDefinicion(cambiarModalidad(base(), 'hibrido'), HOY);
    expect(sinCupo.recordatorios.some((x) => x.paso === 'modalidad')).toBe(true);
    const mal = revisarDefinicion({ ...cambiarModalidad(base(), 'hibrido'), cupoPresencial: '12.5' }, HOY);
    expect(mal.errores.some((x) => x.paso === 'modalidad')).toBe(true);
  });

  it('al copiar un evento híbrido se conserva la modalidad, el cupo y el cierre', () => {
    const def = armarDefinicion({ ...cambiarModalidad(base(), 'hibrido'), cupoPresencial: '300', cierrePresencialPct: 90 });
    const copia = armarDefinicion({ ...desdeEvento(def), nombre: 'Otro', fecha: '2027-01-10' });
    expect(copia.modalidad).toBe('hibrido');
    expect(copia.cupoPresencial).toBe(300);
    expect(copia.cierrePresencialPct).toBe(90);
    expect(copia.campos.filter((c) => c.id === 'modalidad')).toHaveLength(1);
  });

  it('el resumen en palabras simples lo dice', () => {
    const def = armarDefinicion({ ...cambiarModalidad(base(), 'hibrido'), cupoPresencial: '500', cierrePresencialPct: 100 });
    expect(resumenSimple(def).join(' ')).toMatch(/híbrido.*500 lugares presenciales.*100 %/);
  });
});
