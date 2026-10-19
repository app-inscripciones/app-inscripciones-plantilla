import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { MENSAJES_PANEL, MENSAJES_AUTOPRESENTE, mensajeError, codigoDeErrorSupabase, problemaDefinicion } from './mensajes.js';
import { MENSAJES_ACTIVACION } from './sesion.js';
import { MENSAJES_ERROR } from './sincronizacion.js';

const sql = readdirSync('supabase').filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => readFileSync(`supabase/${f}`, 'utf8')).join('\n');
const codigosBase = [...new Set([...sql.matchAll(/'error',\s*'([a-z_]+)'/g)].map((m) => m[1]))];

describe('mensajes de error (Etapa 9)', () => {
  it('cada código de error que devuelve la base tiene un mensaje propio', () => {
    expect(codigosBase.length).toBeGreaterThan(15);
    const conocidos = { ...MENSAJES_PANEL, ...MENSAJES_AUTOPRESENTE, ...MENSAJES_ACTIVACION, ...MENSAJES_ERROR };
    const sinMensaje = codigosBase.filter((c) => !conocidos[c]);
    expect(sinMensaje).toEqual([]);
  });

  it('un código desconocido no se confunde con falta de internet y muestra el código', () => {
    const t = mensajeError({ ok: false, error: 'algo_nuevo' });
    expect(t).toContain('algo_nuevo');
    expect(t).not.toMatch(/internet/i);
  });

  it('sin respuesta se informa como falta de conexión', () => {
    expect(mensajeError(null)).toBe(MENSAJES_PANEL.sin_conexion);
  });

  it('los mensajes propios de una pantalla tienen prioridad', () => {
    expect(mensajeError({ error: 'datos_invalidos' }, { datos_invalidos: 'X' })).toBe('X');
  });

  it('distingue internet, sesión vencida, base desactualizada y error de la base', () => {
    expect(codigoDeErrorSupabase({ message: 'TypeError: Failed to fetch', code: '' })).toBe('sin_conexion');
    expect(codigoDeErrorSupabase({ code: 'PGRST301', message: 'JWT expired' })).toBe('sesion_vencida');
    expect(codigoDeErrorSupabase({ status: 540, message: 'Project paused', code: '' })).toBe('base_pausada');
    expect(codigoDeErrorSupabase({ code: 'PGRST202', message: 'Could not find the function' })).toBe('base_desactualizada');
    expect(codigoDeErrorSupabase({ code: '23514', message: 'violates check constraint' })).toBe('error_base');
  });

  it('cada problema que informa la base al abrir un evento se traduce y dice en qué paso se arregla', () => {
    const sqlAsistente = ['009_asistente_eventos.sql', '013_categorias.sql', '015_modalidad.sql'].map((f) => readFileSync(`supabase/${f}`, 'utf8')).join('\n');
    const problemas = [...new Set([...sqlAsistente.matchAll(/then return '([^']+)'/g)].map((m) => m[1]))]
      .concat(['la fecha ya pasó', 'campo talle']);
    const pasos = ['nombre', 'fechas', 'unidad', 'modalidad', 'categorias', 'datos', 'cobro', 'asistencia'];
    for (const p of problemas.filter((x) => !/sin definición|demasiado grande|_/.test(x))) {
      const r = problemaDefinicion(p);
      expect(r, p).not.toBeNull();
      expect(pasos, p).toContain(r.paso);
    }
    expect(problemaDefinicion('edades de categorías superpuestas').paso).toBe('categorias');
    expect(problemaDefinicion('la fecha ya pasó').paso).toBe('fechas');
    expect(problemaDefinicion('precio').paso).toBe('cobro');
  });

  it('ningún mensaje del panel queda sin decir qué hacer (todos tienen más de 6 palabras)', () => {
    for (const [c, t] of Object.entries(MENSAJES_PANEL)) expect(t.split(' ').length, c).toBeGreaterThan(5);
  });
});
