import { describe, it, expect } from 'vitest';
import { TEMAS } from './temas.js';
import enlaces from './enlaces.json';

describe('ayuda dentro de la app', () => {
  it('cada sección del panel y cada pantalla del celular tiene su ayuda', () => {
    for (const t of ['resumen', 'inscripciones', 'rendiciones', 'eventos', 'qr', 'personas', 'institucion', 'cargador', 'puerta', 'rendir']) {
      expect(TEMAS[t], t).toBeTruthy();
      expect(TEMAS[t].puntos.length, t).toBeGreaterThanOrEqual(3);
    }
  });
  it('cada tema apunta a un rol que tiene lugar para su manual y su video', () => {
    for (const [k, t] of Object.entries(TEMAS)) {
      expect(enlaces.manuales, k).toHaveProperty(t.rol);
      expect(enlaces.videos, k).toHaveProperty(t.rol);
    }
  });
  it('frases cortas: ningún punto pasa de 45 palabras', () => {
    for (const t of Object.values(TEMAS)) for (const p of t.puntos) expect(p.split(' ').length, p).toBeLessThanOrEqual(45);
  });
});

import { SECCIONES, comoMarkdown } from './queHagoSi.js';
describe('guía «¿Qué hago si…?»', () => {
  it('tiene casos para el celular, el panel y el mantenimiento, cada uno con pasos', () => {
    expect(SECCIONES.map((s) => s.id)).toEqual(['celular', 'panel', 'mantenimiento']);
    for (const s of SECCIONES) for (const c of s.casos) expect(c.pasos.length, c.pregunta).toBeGreaterThanOrEqual(2);
  });
  it('los mensajes de error que mandan a la guía tienen su caso', () => {
    const preguntas = SECCIONES.flatMap((s) => s.casos.map((c) => c.pregunta)).join(' | ');
    expect(preguntas).toMatch(/No me llega el código/);
    expect(preguntas).toMatch(/desactualizada/);
    expect(preguntas).toMatch(/Algo no salió bien/);
    expect(preguntas).toMatch(/Respaldo diario/);
  });
  it('se puede pasar a texto para imprimir', () => {
    const md = comoMarkdown();
    expect(md).toContain('# ¿Qué hago si…?');
    expect(md).toContain('### No hay internet en el lugar');
  });
});
