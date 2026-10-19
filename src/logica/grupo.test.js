import { describe, it, expect } from 'vitest';
import { calcularCobro } from './precios.js';
import { limpiarRespuestas } from './reglas.js';
import { validar, avisos, claveIntegrante } from './validacion.js';
import { personasDe, nombreGrupo, nuevoIntegrante, nombreDeInscripcion } from './grupo.js';
import { TORNEO, FAMILIAS } from './grupoEjemplos.js';

const equipo = (n) => ({
  nombre_grupo: 'Los Pibes', telefono: '3624111222',
  integrantes: Array.from({ length: n }, (_, k) => ({ id: `i${k + 1}`, ...(k === 0 ? { responsable: true } : {}), nombre: `Jugador ${k + 1}`, dni: String(30000001 + k) })),
});

describe('grupos: cobro', () => {
  it('un precio por grupo, sin importar cuántos son', () => {
    expect(calcularCobro(TORNEO, equipo(5), '2027-03-01').total).toBe(40000);
    expect(calcularCobro(TORNEO, equipo(6), '2027-03-15').total).toBe(50000);
    expect(calcularCobro(TORNEO, equipo(6), '2027-03-15').detalle[0].tramo).toBe('Precio normal');
  });
  it('según cada integrante: suma por categoría y conceptos del grupo para cada uno', () => {
    const r = { nombre_grupo: 'Pérez', telefono: '3624111222', transporte: 'si', integrantes: [
      { id: 'i1', responsable: true, nombre: 'Ana', edad: '40', categoria: 'adultos' },
      { id: 'i2', nombre: 'Juan', edad: '38', categoria: 'adultos' },
      { id: 'i3', nombre: 'Lola', edad: '7', categoria: 'ninos' },
    ] };
    const c = calcularCobro(FAMILIAS, r, '2027-04-01');
    expect(c.faltaDato).toBe(false);
    expect(c.total).toBe(5000 + 5000 + 2000 + 3 * 1000);
    expect(c.detalle.find((d) => d.id === 'matricula')).toMatchObject({ monto: 12000, cantidad: 3 });
    expect(c.detalle.find((d) => d.id === 'transporte')).toMatchObject({ monto: 3000, cantidad: 3 });
    expect(calcularCobro(FAMILIAS, { ...r, transporte: 'no' }, '2027-04-01').total).toBe(12000);
  });
  it('según cada integrante: falta la categoría de alguno, todavía no hay total', () => {
    const r = { transporte: 'no', integrantes: [{ id: 'i1', categoria: 'adultos' }, { id: 'i2' }] };
    expect(calcularCobro(FAMILIAS, r, '2027-04-01').faltaDato).toBe(true);
    expect(calcularCobro(FAMILIAS, { transporte: 'no', integrantes: [] }, '2027-04-01').faltaDato).toBe(true);
  });
});

describe('grupos: datos que se guardan', () => {
  it('guarda lo del grupo y lo de cada integrante, sin mezclar', () => {
    const r = { nombre_grupo: 'Pérez', telefono: '3624111222', transporte: 'si', basura: 'x',
      integrantes: [{ id: 'i1', responsable: true, nombre: 'Ana', edad: '40', categoria: 'adultos', otra: 'z' }, { id: 'i3', nombre: 'Lola', edad: '7', categoria: 'ninos', dni: '' }] };
    expect(limpiarRespuestas(FAMILIAS, r)).toEqual({
      nombre_grupo: 'Pérez', telefono: '3624111222', transporte: 'si',
      integrantes: [
        { id: 'i1', responsable: true, categoria: 'adultos', nombre: 'Ana', edad: '40' },
        { id: 'i3', categoria: 'ninos', nombre: 'Lola', edad: '7' },
      ],
    });
  });
});

describe('grupos: controles', () => {
  const pago = { medio: 'efectivo' };
  it('equipo completo y correcto: sin errores', () => {
    expect(validar(TORNEO, equipo(5), pago)).toEqual({});
    expect(validar(TORNEO, equipo(6), pago)).toEqual({});
  });
  it('mínimo y máximo de integrantes', () => {
    expect(validar(TORNEO, equipo(4), pago).integrantes).toMatch(/Faltan integrantes.*entre 5 y 6.*cargaste 4/);
    const siete = equipo(7);
    expect(validar(TORNEO, siete, pago).integrantes).toMatch(/hasta 6/);
  });
  it('un solo responsable', () => {
    const e = equipo(5); e.integrantes[0].responsable = false;
    expect(validar(TORNEO, e, pago).integrantes).toMatch(/responsable/);
    const dos = equipo(5); dos.integrantes[1].responsable = true;
    expect(validar(TORNEO, dos, pago).integrantes).toMatch(/uno solo/);
  });
  it('datos de cada integrante y DNI repetido dentro del grupo', () => {
    const e = equipo(5); e.integrantes[2].nombre = ''; e.integrantes[4].dni = e.integrantes[1].dni;
    const err = validar(TORNEO, e, pago);
    expect(err[claveIntegrante('i3', 'nombre')]).toMatch(/obligatorio/);
    expect(err[claveIntegrante('i5', 'dni')]).toMatch(/integrante 2/);
  });
  it('categoría de cada integrante y aviso de edad', () => {
    const r = { nombre_grupo: 'Pérez', telefono: '3624111222', transporte: 'no', integrantes: [
      { id: 'i1', responsable: true, nombre: 'Ana', edad: '40', categoria: 'ninos' }, { id: 'i2', nombre: 'Lola', edad: '7' }] };
    expect(validar(FAMILIAS, r, pago)[claveIntegrante('i2', 'categoria')]).toBe('Elegí la categoría.');
    expect(avisos(FAMILIAS, r)[0]).toMatch(/Integrante 1 \(Ana\).*40 años.*Niños/);
  });
});

describe('grupos: utilidades', () => {
  it('personas, nombres y nuevos integrantes', () => {
    expect(personasDe(TORNEO, equipo(6))).toBe(6);
    expect(personasDe({ unidad: 'pareja' }, {})).toBe(2);
    expect(personasDe({ unidad: 'persona' }, {})).toBe(1);
    expect(nombreGrupo(TORNEO).plural).toBe('equipos');
    expect(nombreGrupo(FAMILIAS).Plural).toBe('Familias');
    expect(nombreGrupo({ grupo: { nombre: 'Grupo' } }).plural).toBe('grupos');
    expect(nuevoIntegrante([])).toEqual({ id: 'i1', responsable: true });
    expect(nuevoIntegrante([{ id: 'i1' }, { id: 'i4' }])).toEqual({ id: 'i5' });
    expect(nombreDeInscripcion({ nombre_grupo: 'Los Pibes' })).toBe('Los Pibes');
    expect(nombreDeInscripcion({ hombre: 'Juan', mujer: 'Ana' })).toBe('Juan y Ana');
  });
});
