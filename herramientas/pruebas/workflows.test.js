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
