import { describe, it, expect } from 'vitest';
import { formatoHorario } from './fechas.js';

describe('Horario de un acceso', () => {
  it('mismo día, en hora argentina y formato 24 h', () => {
    expect(formatoHorario('2026-11-01T18:00:00Z', '2026-11-02T00:30:00Z')).toMatch(/^dom\.? 01\/11 de 15:00 a 21:30$/);
  });
  it('termina al día siguiente', () => {
    expect(formatoHorario('2026-11-01T23:00:00Z', '2026-11-02T05:00:00Z')).toMatch(/^dom\.? 01\/11 20:00 a lun\.? 02\/11 02:00$/);
  });
});

import { formatoFechaHora } from './fechas.js';
describe('Fecha y hora', () => {
  it('formato argentino de 24 h', () => {
    expect(formatoFechaHora('2026-10-12T22:04:00Z')).toBe('12/10/2026 19:04');
  });
});
