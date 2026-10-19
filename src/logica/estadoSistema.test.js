import { describe, it, expect } from 'vitest';
import { evaluarEstado, VERSION_BASE } from './estadoSistema.js';
import { evaluarPrimerosPasos } from './primerosPasos.js';
import { versionCodigo } from '../../herramientas/revision/revisar.mjs';

const r = (o = {}) => ({ ok: true, version: VERSION_BASE, espacioUsado: 10 * 1048576, espacioLimite: 500 * 1048576, horasDesdeUltima: 3,
  ultima: { cuando: '2026-10-13T10:47:00Z', resultados: [{ id: 'respaldo', estado: 'ok', titulo: 'Respaldo diario' }] }, ...o });

describe('estado del sistema en el panel (D58)', () => {
  it('la versión que espera la app es la del último archivo SQL', () => {
    expect(VERSION_BASE).toBe(versionCodigo());
  });
  it('todo en orden', () => {
    const e = evaluarEstado(r());
    expect(e.problemas).toBe(0);
    expect(e.avisos).toBe(0);
    expect(e.respaldoOk).toBe(true);
  });
  it('si la revisión dejó de correr, el panel lo detecta solo', () => {
    const e = evaluarEstado(r({ horasDesdeUltima: 80 }));
    expect(e.problemas).toBe(1);
    expect(e.items[0].titulo).toMatch(/no corre hace 3 días/);
  });
  it('antes de la primera revisión: un aviso, sin alarma', () => {
    const e = evaluarEstado(r({ ultima: null, horasDesdeUltima: null }));
    expect(e.nunca).toBe(true);
    expect(e.problemas).toBe(0);
    expect(e.items.find((x) => x.id === 'revision').estado).toBe('aviso');
  });
  it('versión y espacio se ven en el momento, aunque la revisión haya dicho otra cosa', () => {
    const vieja = r({ version: VERSION_BASE - 1, ultima: { cuando: 'x', resultados: [{ id: 'version', estado: 'ok', titulo: 'Versión de la base' }] } });
    expect(evaluarEstado(vieja).items.filter((x) => x.id === 'version')).toEqual([expect.objectContaining({ estado: 'aviso' })]);
    expect(evaluarEstado(r({ espacioUsado: 480 * 1048576 })).problemas).toBe(1);
  });
  it('los problemas aparecen primero', () => {
    const e = evaluarEstado(r({ ultima: { cuando: 'x', resultados: [{ id: 'a', estado: 'ok', titulo: 'a' }, { id: 'b', estado: 'problema', titulo: 'b' }] } }));
    expect(e.items[0].estado).toBe('problema');
  });
  it('«Comprobar el respaldo diario» de los Primeros pasos se marca solo con un respaldo bueno', () => {
    const base = { institucionConfigurada: true, usuarios: [], eventos: [] };
    expect(evaluarPrimerosPasos({ ...base, respaldoOk: true }).pasos.find((p) => p.id === 'respaldo').hecho).toBe(true);
    expect(evaluarPrimerosPasos(base).pasos.find((p) => p.id === 'respaldo').hecho).toBe(false);
  });
});
