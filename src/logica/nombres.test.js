import { describe, it, expect } from 'vitest';
import { etiquetaEvento, nombreNormal } from './fechas.js';
import { nuevoBorrador, revisarDefinicion } from './asistente.js';

// D63: nombres de evento sin repetir y con la fecha en las listas.
describe('nombres de evento', () => {
  it('compara sin mayúsculas, acentos ni espacios de más', () => {
    expect(nombreNormal('  Jornada  de PRUEBA ')).toBe('jornada de prueba');
    expect(nombreNormal('Reunión General')).toBe(nombreNormal('reunion general'));
    expect(nombreNormal('Jornada 1')).not.toBe(nombreNormal('Jornada 2'));
  });

  it('la etiqueta lleva la fecha (y la marca de práctica)', () => {
    expect(etiquetaEvento({ nombre: 'Jornada de prueba', fecha: '2026-10-16' })).toBe('Jornada de prueba · 16/10/2026');
    expect(etiquetaEvento({ nombre: 'Práctica', fecha: '2026-10-16', practica: true })).toBe('🧪 Práctica · 16/10/2026');
  });

  it('el asistente no deja seguir con un nombre que ya usa otro evento', () => {
    const b = { ...nuevoBorrador(), nombre: 'jornada de PRUEBA', fecha: '2026-12-01' };
    const otros = [{ nombre: 'Jornada de prueba', fecha: '2026-10-16' }];
    const errores = revisarDefinicion(b, '2026-10-13', otros).errores.filter((e) => e.paso === 'nombre');
    expect(errores).toHaveLength(1);
    expect(errores[0].texto).toContain('Ya hay un evento llamado «Jornada de prueba» (16/10/2026)');
    expect(revisarDefinicion({ ...b, nombre: 'Jornada de prueba 2027' }, '2026-10-13', otros).errores.filter((e) => e.paso === 'nombre')).toHaveLength(0);
    expect(revisarDefinicion(b, '2026-10-13').errores.filter((e) => e.paso === 'nombre')).toHaveLength(0);
  });
});
