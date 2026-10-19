import { describe, it, expect } from 'vitest';
import {
  nuevoBorrador, cambiarUnidad, cambiarGrupo, cambiarAlcance, alternarPregunta, armarDefinicion, revisarDefinicion,
  resumenSimple, desdeEvento, PREGUNTAS_COMUNES, preguntaParaUnidad,
} from './asistente.js';

const pregunta = (id) => PREGUNTAS_COMUNES.find((p) => p.id === id);
const base = () => ({ ...nuevoBorrador(), nombre: 'Torneo', fecha: '2027-03-20', conceptos: [{ id: 'matricula', nombre: 'Inscripción', aplicaSi: null, precios: [{ monto: '50000' }] }] });

describe('asistente: inscripción por grupo (D61)', () => {
  it('al elegir «En grupo» pide el nombre del grupo y el de cada integrante; el DNI pasa a ser de cada integrante', () => {
    const b = cambiarUnidad(base(), 'grupo');
    const def = armarDefinicion(b);
    expect(def.unidad).toBe('grupo');
    expect(def.grupo).toEqual({ nombre: 'equipo', min: 5, max: 6, cobro: 'grupo' });
    expect(def.campos.map((c) => [c.id, !!c.porIntegrante])).toEqual([['nombre_grupo', false], ['nombre', true], ['dni', true], ['telefono', false]]);
    expect(def.campos[0].etiqueta).toBe('Nombre del equipo');
    expect(def.asistencia.modoPareja).toBe('pareja');
    expect(def.asistencia.camposBusqueda).toContain('nombre_grupo');
  });
  it('cambiar el nombre del grupo actualiza el texto automático; volver a persona saca lo de grupo', () => {
    let b = cambiarGrupo(cambiarUnidad(base(), 'grupo'), { nombre: 'familia' });
    expect(b.campos.find((c) => c.id === 'nombre_grupo').etiqueta).toBe('Nombre de la familia');
    b = cambiarUnidad(b, 'persona');
    const def = armarDefinicion(b);
    expect(def.grupo).toBeUndefined();
    expect(def.campos.some((c) => c.porIntegrante || c.id === 'nombre_grupo')).toBe(false);
    expect(def.campos.map((c) => c.id)).toEqual(['nombre', 'dni', 'telefono']);
  });
  it('preguntas comunes: edad y restricciones a cada integrante; transporte una vez por grupo', () => {
    let b = cambiarUnidad(base(), 'grupo');
    b = alternarPregunta(alternarPregunta(alternarPregunta(b, pregunta('edad')), pregunta('restricciones')), pregunta('transporte'));
    const def = armarDefinicion(b);
    const por = Object.fromEntries(def.campos.map((c) => [c.id, !!c.porIntegrante]));
    expect(por).toMatchObject({ edad: true, restricciones: true, restricciones_cuales: true, transporte: false });
    expect(preguntaParaUnidad(pregunta('dni'), 'pareja')).toBe(false);
    expect(preguntaParaUnidad(pregunta('dni'), 'grupo')).toBe(true);
  });
  it('con «un precio por grupo» no hay precios por categoría ni cobros que dependan de un integrante', () => {
    let b = { ...cambiarUnidad(base(), 'grupo'), usaCategorias: true, categorias: [{ id: 'a', nombre: 'A', edadMin: 0, edadMax: 20 }, { id: 'b', nombre: 'B', edadMin: 21, edadMax: 99 }] };
    b = cambiarGrupo(b, { cobro: 'integrante' });
    b = { ...b, conceptos: [{ id: 'm', nombre: 'Matrícula', aplicaSi: { campo: 'dni', igual: 'x' }, precios: [{ porCategoria: { a: '1', b: '2' } }] }] };
    expect(armarDefinicion(b).conceptos[0].precios[0].porCategoria).toEqual({ a: 1, b: 2 });
    expect(armarDefinicion(b).conceptos[0].aplicaSi).toEqual({ campo: 'dni', igual: 'x' });
    const g = cambiarGrupo(b, { cobro: 'grupo' });
    expect(g.conceptos[0].aplicaSi).toBeNull();
    expect(g.conceptos[0].precios[0].porCategoria).toBeUndefined();
  });
  it('cambiar el alcance de una pregunta propia', () => {
    let b = cambiarUnidad(base(), 'grupo');
    b = { ...b, campos: [...b.campos, { id: 'p_talle', etiqueta: 'Talle', tipo: 'texto', obligatorio: true }, { id: 'p_cual', etiqueta: '¿Cuál?', tipo: 'texto', obligatorio: false, visibleSi: { campo: 'p_talle', igual: 'x' } }] };
    b = cambiarAlcance(b, 'p_talle', true);
    expect(b.campos.find((c) => c.id === 'p_talle').porIntegrante).toBe(true);
    expect(b.campos.find((c) => c.id === 'p_cual').visibleSi).toBeNull(); // una pregunta del grupo no puede depender de una de integrante
    expect(cambiarAlcance(b, 'p_talle', false).campos.find((c) => c.id === 'p_talle').porIntegrante).toBeUndefined();
  });
  it('controles: nombre del grupo y cantidad de integrantes', () => {
    const b = cambiarUnidad(base(), 'grupo');
    expect(revisarDefinicion(b, '2027-01-01').errores).toEqual([]);
    const mal = revisarDefinicion(cambiarGrupo(b, { min: 8, max: 6 }), '2027-01-01').errores.map((e) => e.texto);
    expect(mal).toContain('El mínimo de integrantes no puede ser mayor que el máximo.');
    expect(revisarDefinicion(cambiarGrupo(b, { min: 1 }), '2027-01-01').errores[0].paso).toBe('unidad');
    expect(revisarDefinicion(cambiarGrupo(b, { nombre: '' }), '2027-01-01').errores[0].texto).toMatch(/cómo se llama cada grupo/);
    const sinDni = alternarPregunta(b, pregunta('dni'));
    expect(revisarDefinicion(sinDni, '2027-01-01').recordatorios.map((r) => r.texto).join(' ')).toMatch(/DNI de cada integrante/);
  });
  it('resumen en palabras simples y copia de un evento por grupo', () => {
    const b = cambiarGrupo(cambiarUnidad(base(), 'grupo'), { nombre: 'familia', min: 2, max: 8, cobro: 'integrante' });
    const lineas = resumenSimple(armarDefinicion(b)).join(' ');
    expect(lineas).toMatch(/Se inscriben por familia: cada inscripción es una familia de 2 a 8 personas/);
    expect(lineas).toMatch(/según cada integrante/);
    expect(lineas).toMatch(/De cada integrante se pide: Nombre y apellido · DNI/);
    const copia = desdeEvento(armarDefinicion(b));
    expect(copia.unidad).toBe('grupo');
    expect(copia.grupo).toEqual({ nombre: 'familia', min: 2, max: 8, cobro: 'integrante' });
  });
  it('autopresente con QR (D62): solo si se toma asistencia', () => {
    const b = { ...base(), asistencia: { ...base().asistencia, autopresente: true } };
    expect(armarDefinicion(b).asistencia.autopresente).toBe(true);
    expect(resumenSimple(armarDefinicion(b)).join(' ')).toMatch(/escaneando un QR/);
    expect(armarDefinicion({ ...b, asistencia: { ...b.asistencia, modo: 'no', toma: false } }).asistencia.autopresente).toBe(false);
    expect(armarDefinicion(base()).asistencia.autopresente).toBe(false);
  });
});
