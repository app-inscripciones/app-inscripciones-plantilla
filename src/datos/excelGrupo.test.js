import { describe, it, expect } from 'vitest';
import { armarHojas } from './excel.js';
import { FAMILIAS } from '../logica/grupoEjemplos.js';

const ex = {
  generado: '2027-04-01T12:00:00Z',
  resumen: { inscriptos: 1, personas: 3, anuladas: 0, dinero: { total: 15000, efectivo: 15000, rendido: 0, terminal: 0, transferencia: 0 }, porCargador: [] },
  rendiciones: [],
  presentes: { ok: true, asistencia: { toma: true, modoPareja: 'individual' }, porInstancia: [{ id: 'llegada', nombre: 'Llegada' }],
    marcas: [{ inscripcionId: 'x', instancia: 'llegada', persona: 'i3', marcadaEn: '2027-04-10T12:05:00Z' }] },
  inscripciones: [{ id: 'x', numeroOrden: 7, creadaEn: '2027-04-01T12:00:00Z', cargador: 'Ana', estado: 'activa', monto: 15000, medioPago: 'efectivo',
    conceptos: [{ id: 'matricula', nombre: 'Matrícula', monto: 12000, cantidad: 3 }],
    datos: { nombre_grupo: 'Pérez', telefono: '3624111222', transporte: 'si', integrantes: [
      { id: 'i1', responsable: true, nombre: 'Ana Pérez', edad: '40', categoria: 'adultos' },
      { id: 'i2', nombre: 'Juan Pérez', edad: '38', categoria: 'adultos' },
      { id: 'i3', nombre: 'Lola Pérez', edad: '7', categoria: 'ninos' }] } }],
};

describe('Excel de un evento por grupo (D61)', () => {
  it('una fila por familia en «Inscriptos» y una por persona en «Integrantes»', () => {
    const hojas = armarHojas(FAMILIAS, ex);
    expect(hojas.map((h) => h.sheet)).toEqual(['Inscriptos', 'Integrantes', 'Resumen por cargador', 'Rendiciones']);
    const ins = hojas[0].data;
    const enc = ins[0].map((c) => c.value);
    expect(enc).toContain('Integrantes');
    expect(enc).not.toContain('Nombre y apellido');
    const fila = ins[1].map((c) => c.value);
    expect(fila[enc.indexOf('Integrantes')]).toBe(3);
    expect(fila[enc.indexOf('Responsable')]).toBe('Ana Pérez');
    expect(fila[enc.indexOf('Detalle del cobro')]).toMatch(/Matrícula × 3/);
    expect(fila[enc.indexOf('Presente – Llegada')]).toBe('1 de 3');
    const integ = hojas[1].data;
    const e2 = integ[0].map((c) => c.value);
    expect(integ.length).toBe(4);
    expect(integ[3].map((c) => c.value)[e2.indexOf('Nombre y apellido')]).toBe('Lola Pérez');
    expect(integ[3].map((c) => c.value)[e2.indexOf('Categoría')]).toBe('Niños');
    expect(integ[3].map((c) => c.value)[e2.indexOf('Presente – Llegada')]).toMatch(/^Sí ·/);
    expect(integ[1].map((c) => c.value)[e2.indexOf('Presente – Llegada')]).toBeNull();
    expect(hojas[2].data.find((f) => f[0] && f[0].value === 'Personas')[1].value).toBe(3);
  });
});
