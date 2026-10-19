import { describe, it, expect } from 'vitest';
import { evaluarPrimerosPasos } from './primerosPasos.js';

describe('primeros pasos del Responsable general', () => {
  it('recién instalado: nada hecho y el siguiente es cargar la institución', () => {
    const r = evaluarPrimerosPasos({ usuarios: [{ activo: true, roles: ['responsable'] }], eventos: [] });
    expect(r.hechos).toBe(0);
    expect(r.siguiente).toBe('institucion');
    expect(r.completo).toBe(false);
  });

  it('el equipo cuenta cuando hay Organizador y Tesorero activos (pueden ser la misma persona)', () => {
    const base = { institucionConfigurada: true, eventos: [] };
    // Un evento de práctica no cuenta como «primer evento» (D56).
    expect(evaluarPrimerosPasos({ ...base, eventos: [{ id: 'p', practica: true }], usuarios: [{ activo: true, roles: ['responsable', 'organizador', 'tesorero'] }] }).siguiente).toBe('practica');
    // D66: la práctica va antes del primer evento.
    expect(evaluarPrimerosPasos({ ...base, practicaHecha: true, eventos: [{ id: 'p', practica: true }], usuarios: [{ activo: true, roles: ['responsable', 'organizador', 'tesorero'] }] }).siguiente).toBe('evento');
    expect(evaluarPrimerosPasos({ ...base, usuarios: [{ activo: true, roles: ['responsable', 'organizador'] }] }).siguiente).toBe('personas');
    expect(evaluarPrimerosPasos({ ...base, usuarios: [{ activo: true, roles: ['responsable', 'organizador', 'tesorero'] }] }).siguiente).toBe('practica');
    expect(evaluarPrimerosPasos({ ...base, usuarios: [{ activo: false, roles: ['organizador', 'tesorero'] }] }).siguiente).toBe('personas');
  });

  it('los pasos que la app no puede comprobar se marcan a mano y queda completo', () => {
    const r = evaluarPrimerosPasos({
      institucionConfigurada: true,
      usuarios: [{ activo: true, roles: ['organizador', 'tesorero'] }],
      eventos: [{ id: 'x' }],
      practicaHecha: true,
      hechosAMano: { respaldo: true, hoja: true },
    });
    expect(r.completo).toBe(true);
    expect(r.hechos).toBe(r.total);
  });
});
