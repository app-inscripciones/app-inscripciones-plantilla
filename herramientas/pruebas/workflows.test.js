// Que ninguna tarea automática de GitHub (Actions) tenga un error de escritura: si lo tiene, GitHub no la corre
// (por ejemplo, el respaldo diario dejaría de hacerse sin que nadie se entere). Pasó una vez con D74.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const dir = new URL('../../.github/workflows/', import.meta.url);
describe('tareas automáticas de GitHub', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
    it(`${f} está bien escrita`, () => {
      const w = parse(readFileSync(new URL(f, dir), 'utf8'));
      expect(w.name).toBeTruthy();
      expect(w.jobs).toBeTruthy();
      for (const job of Object.values(w.jobs)) for (const paso of job.steps || []) expect(paso.run || paso.uses).toBeTruthy();
    });
  }
});

// D76: las tareas de la institución son «cáscaras» que llaman a herramientas/tareas/<tarea>.sh (eso sí se actualiza).
import { existsSync } from 'node:fs';
describe('cáscaras de las tareas (D76)', () => {
  const caso = ['plantilla.yml', 'base-real-caso-testigo.yml'];   // solo existen en el caso testigo
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml') && !caso.includes(x))) {
    it(`${f} llama a un programa que existe`, () => {
      const w = parse(readFileSync(new URL(f, dir), 'utf8'));
      const pasos = Object.values(w.jobs).flatMap((j) => j.steps || []);
      const llamada = pasos.map((p) => p.run || '').find((r) => r.includes('herramientas/tareas/correr.sh'));
      expect(llamada).toBeTruthy();
      const tarea = llamada.trim().split(/\s+/).pop();
      expect(existsSync(new URL(`../tareas/${tarea}.sh`, import.meta.url))).toBe(true);
    });
  }
});
