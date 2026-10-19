import { describe, it, expect } from 'vitest';
import {
  nuevoBorrador, armarDefinicion, revisarDefinicion, alternarPregunta, PREGUNTAS_COMUNES,
  esObligatoria, fijarObligatoria, resumenSimple,
} from './asistente.js';
import { validar } from './validacion.js';

const HOY = '2026-10-14';
const pregunta = (id) => PREGUNTAS_COMUNES.find((p) => p.id === id);
const base = () => ({ ...nuevoBorrador(), nombre: 'Jornada', fecha: '2027-03-10', conceptos: [{ id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ monto: '1000' }] }] });

describe('preguntas frecuentes opcionales (D68)', () => {
  it('por defecto son obligatorias y se pueden dejar opcionales', () => {
    let b = base();
    expect(esObligatoria(b, pregunta('telefono'))).toBe(true);
    b = fijarObligatoria(b, pregunta('telefono'), false);
    expect(esObligatoria(b, pregunta('telefono'))).toBe(false);
    expect(armarDefinicion(b).campos.find((c) => c.id === 'telefono').obligatorio).toBe(false);
    expect(armarDefinicion(b).campos.find((c) => c.id === 'dni').obligatorio).toBe(true);
  });

  it('«¿Cuáles?» sigue a «¿Tiene restricciones?»', () => {
    let b = alternarPregunta(base(), pregunta('restricciones'));
    b = fijarObligatoria(b, pregunta('restricciones'), false);
    const def = armarDefinicion(b);
    expect(def.campos.find((c) => c.id === 'restricciones').obligatorio).toBe(false);
    expect(def.campos.find((c) => c.id === 'restricciones_cuales').obligatorio).toBe(false);
  });

  it('el resumen marca las opcionales y el DNI opcional deja un recordatorio que no impide abrir', () => {
    const b = fijarObligatoria(base(), pregunta('dni'), false);
    const r = revisarDefinicion(b, HOY);
    expect(r.errores).toEqual([]);
    expect(r.recordatorios.some((x) => /DNI es opcional/.test(x.texto))).toBe(true);
    expect(resumenSimple(r.definicion).join(' ')).toMatch(/DNI \(opcional\)/);
  });

  it('el formulario acepta la pregunta opcional en blanco y sigue pidiendo las obligatorias', () => {
    const b = fijarObligatoria(base(), pregunta('telefono'), false);
    const def = armarDefinicion(b);
    const err = validar(def, { nombre: 'Ana Pérez', dni: '30111222', telefono: '' }, { medio: 'efectivo' });
    expect(err.telefono).toBeUndefined();
    const err2 = validar(def, { nombre: 'Ana Pérez', dni: '', telefono: '' }, { medio: 'efectivo' });
    expect(err2.dni).toBeTruthy();
  });
});
