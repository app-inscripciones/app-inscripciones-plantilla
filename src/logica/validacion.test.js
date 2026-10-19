import { describe, it, expect } from 'vitest';
import congreso from '../eventos/congreso-prueba.json';
import retiro from '../eventos/retiro-matrimonios.json';
import { validar, avisos } from './validacion.js';
import { limpiarRespuestas } from './reglas.js';

const congresoOk = {
  categoria: 'jovenes', nombre: 'Ana Pérez', dni: '30123456', telefono: '3624123456',
  edad: '25', iglesia: 'Central', usa_transporte: 'no', gluten: 'no', restricciones: 'no',
};

describe('Validación del formulario', () => {
  it('un congreso completo y en efectivo no tiene errores', () => {
    expect(validar(congreso, congresoOk, { medio: 'efectivo' })).toEqual({});
  });
  it('marca los obligatorios vacíos', () => {
    const e = validar(congreso, {}, {});
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['categoria', 'nombre', 'dni', 'gluten', 'medio']));
  });
  it('a los adultos no se les pregunta el transporte', () => {
    const r = { ...congresoOk, categoria: 'adultos', edad: '40' };
    delete r.usa_transporte;
    expect(validar(congreso, r, { medio: 'efectivo' })).toEqual({});
  });
  it('si hay restricciones, pide cuáles', () => {
    const e = validar(congreso, { ...congresoOk, restricciones: 'si' }, { medio: 'efectivo' });
    expect(e.restricciones_cuales).toBeTruthy();
  });
  it('transferencia: acepta 6 caracteres alfanuméricos', () => {
    expect(validar(congreso, congresoOk, { medio: 'transferencia', banco: 'MP', ultimos6: 'A1B2C3' })).toEqual({});
    expect(validar(congreso, congresoOk, { medio: 'transferencia', banco: 'MP', ultimos6: 'A1B2C' }).ultimos6).toBeTruthy();
  });
  it('transferencia: exige banco y exactamente 6 caracteres', () => {
    expect(validar(congreso, congresoOk, { medio: 'transferencia', banco: '', ultimos6: '123' })).toMatchObject({
      banco: expect.any(String), ultimos6: expect.any(String),
    });
    expect(validar(congreso, congresoOk, { medio: 'transferencia', banco: 'Nación', ultimos6: '123456' })).toEqual({});
  });
  it('DNI y teléfono con formato incorrecto', () => {
    const e = validar(congreso, { ...congresoOk, dni: '123', telefono: '1234' }, { medio: 'efectivo' });
    expect(e.dni).toBeTruthy();
    expect(e.telefono).toBeTruthy();
  });
  it('retiro completo sin errores', () => {
    const r = { hombre: 'Juan', mujer: 'María', telefono: '3624111222', colectivo: 'propios', restricciones: 'no' };
    expect(validar(retiro, r, { medio: 'terminal' })).toEqual({});
  });
});

describe('Avisos (no impiden guardar)', () => {
  it('avisa si la edad no coincide con la categoría', () => {
    expect(avisos(congreso, { categoria: 'adultos', edad: '15' })).toHaveLength(1);
  });
  it('no avisa si coincide', () => {
    expect(avisos(congreso, { categoria: 'jovenes', edad: '21' })).toHaveLength(0);
  });
});

describe('Limpieza de respuestas', () => {
  it('no guarda respuestas de preguntas ocultas', () => {
    const r = limpiarRespuestas(congreso, { ...congresoOk, categoria: 'adultos', usa_transporte: 'si' });
    expect(r.usa_transporte).toBeUndefined();
  });
});
