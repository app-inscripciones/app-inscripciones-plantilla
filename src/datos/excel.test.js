import { describe, it, expect } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import congreso from '../eventos/congreso-prueba.json';
import { armarHojas, nombreArchivo } from './excel.js';

const ex = {
  generado: '2026-10-20T15:00:00Z',
  resumen: {
    inscriptos: 2, anuladas: 1,
    dinero: { total: 7250, efectivo: 3500, terminal: 0, transferencia: 3750, rendido: 2000 },
    porCargador: [{ cargador: 'Ana Pérez', inscripciones: 2, total: 7250, efectivo: 3500, terminal: 0, transferencia: 3750, rendido: 2000, aRendir: 1500 }],
  },
  presentes: { ok: true, asistencia: { toma: true }, porInstancia: [{ id: 'llegada', nombre: 'Llegada' }],
    marcas: [{ inscripcionId: 'i1', instancia: 'llegada', persona: '', marcadaEn: '2026-11-01T12:30:00Z' }] },
  rendiciones: [{ entregadoEn: '2026-10-20T14:00:00Z', cargador: 'Ana Pérez', monto: 2000, recibidoPor: 'Beto', observacion: null, anulada: false }],
  inscripciones: [
    { id: 'i1', numeroOrden: 1, creadaEn: '2026-10-20T13:00:00Z', cargador: 'Ana Pérez', categoria: 'jovenes',
      datos: { nombre: 'Laura Díaz', dni: '35111222', gluten: 'no', usa_transporte: 'si' },
      conceptos: [{ id: 'matricula', nombre: 'Matrícula', monto: 3500 }], monto: 3500, medioPago: 'efectivo', estado: 'activa' },
    { numeroOrden: 2, creadaEn: '2026-10-20T13:10:00Z', cargador: 'Ana Pérez', categoria: 'adultos', datos: { nombre: 'Mario' },
      conceptos: [], monto: 3750, medioPago: 'transferencia', banco: 'MP', ultimos6: 'A1B2C3', estado: 'posible_duplicado', duplicadoDe: 1, fueraDeHorario: true },
  ],
};

describe('Excel del evento', () => {
  const hojas = armarHojas(congreso, ex);

  it('tiene las tres hojas acordadas (D10)', () => {
    expect(hojas.map((h) => h.sheet)).toEqual(['Inscriptos', 'Resumen por cargador', 'Rendiciones']);
  });

  it('una fila por inscripción, con los campos del evento, categoría por nombre y Sí/No legibles', () => {
    const [enc, f1, f2] = hojas[0].data;
    const col = (nombre) => enc.findIndex((c) => c.value === nombre);
    expect(hojas[0].data).toHaveLength(3);
    expect(f1[col('Categoría')].value).toBe('Jóvenes de 21 a 30 años');
    expect(f1[col('¿Tiene intolerancia al gluten?')].value).toBe('No');
    expect(f1[col('Monto')].value).toBe(3500);
    expect(f2[col('Medio de pago')].value).toBe('Transferencia');
    expect(f2[col('Estado')].value).toBe('Para revisar');
    expect(f2[col('Observaciones')].value).toMatch(/duplicado de Nº 1.*fuera de horario/i);
    expect(f1[col('Presente – Llegada')].value).toBe('Sí · 09:30');
    expect(f2[col('Presente – Llegada')].value).toBeNull();
  });

  it('el resumen muestra lo que falta rendir', () => {
    const fila = hojas[1].data.find((f) => f[0] && f[0].value === 'Efectivo pendiente de rendir');
    expect(fila[1].value).toBe(1500);
  });

  it('explica los números negativos (se rindió de más) y no agrega notas si no hay', () => {
    const textoDe = (hs) => hs[1].data.flat().map((c) => c && c.value).join(' | ');
    expect(textoDe(hojas)).not.toMatch(/negativo/);
    const conAnulada = { ...ex, resumen: { ...ex.resumen, porCargador: [{ ...ex.resumen.porCargador[0], aRendir: -1000, ticketsTerminal: 0, ticketsRendidos: 1, ticketsPendientes: -1 }] } };
    const t = textoDe(armarHojas(congreso, conAnulada));
    expect(t).toMatch(/negativo en «Falta rendir»/);
    expect(t).toMatch(/negativo en «Faltan tickets»/);
  });

  it('se puede escribir como archivo .xlsx', async () => {
    const buffer = await writeExcelFile(hojas).toBuffer();
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // un .xlsx es un zip
  });

  it('nombre del archivo sin acentos ni espacios', () => {
    expect(nombreArchivo({ nombre: 'Retiro de matrimonios (modelo)' }, new Date(2026, 9, 20, 9, 5))).toBe('Retiro-de-matrimonios-modelo_2026-10-20_0905.xlsx');
  });
});
