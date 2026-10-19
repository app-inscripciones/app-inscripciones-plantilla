import { describe, it, expect } from 'vitest';
import { despertar } from './despertar.mjs';
import { apiSimulada } from './simulado.mjs';

const inst = { supabase: { real: { nombre: 'x-real', ref: 'refrealaaaaaaaaaaaaa' }, pruebas: { nombre: 'x-pruebas', ref: 'refpruebasaaaaaaaaaa' } } };
const env = { SUPABASE_ACCESS_TOKEN: 'sb-token', SUPABASE_API: 'https://sb.test' };
const opciones = (fetchFn) => ({ fetchFn, pausa: 0, log: () => {} });

describe('despertar las bases (D74)', () => {
  it('despierta una base pausada y deja tranquila la que está activa, y las «toca» a las dos', async () => {
    const { fetchFn, estado } = apiSimulada();
    estado.proyectos.push({ ref: 'refrealaaaaaaaaaaaaa', name: 'x-real', status: 'INACTIVE' }, { ref: 'refpruebasaaaaaaaaaa', name: 'x-pruebas', status: 'ACTIVE_HEALTHY' });
    const r = await despertar(env, inst, opciones(fetchFn));
    expect(r).toEqual({ real: 'despertada', pruebas: 'activa' });
    expect(estado.reactivadas).toBe(1);
    expect(estado.consultas.filter((c) => c.query === 'select 1').map((c) => c.ref).sort()).toEqual(['refpruebasaaaaaaaaaa', 'refrealaaaaaaaaaaaaa']);
  });

  it('si la llave no sirve, lo dice en palabras simples (no se rompe)', async () => {
    const { fetchFn, estado } = apiSimulada();
    estado.proyectos.push({ ref: 'refrealaaaaaaaaaaaaa', name: 'x-real', status: 'INACTIVE' });
    const r = await despertar({ ...env, SUPABASE_ACCESS_TOKEN: 'mala' }, inst, opciones(fetchFn));
    expect(r.real).toMatch(/llave de Supabase/);
  });

  it('si no se despierta a tiempo, avisa', async () => {
    const { fetchFn, estado } = apiSimulada();
    estado.proyectos.push({ ref: 'refrealaaaaaaaaaaaaa', name: 'x-real', status: 'RESTORING' });
    const r = await despertar(env, inst, { ...opciones(fetchFn), intentos: 2 });
    expect(r.real).toMatch(/no se pudo/);
  });
});
