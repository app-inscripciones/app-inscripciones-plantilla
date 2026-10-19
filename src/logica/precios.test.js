import { describe, it, expect } from 'vitest';
import congreso from '../eventos/congreso-prueba.json';
import retiro from '../eventos/retiro-matrimonios.json';
import { calcularCobro, tramoVigente } from './precios.js';
import { diaLocal } from './fechas.js';

const ANTES = '2026-10-15';
const CORTE = '2026-10-21';
const DESPUES = '2026-10-22';

describe('Tramos de precio por fecha', () => {
  const precios = congreso.conceptos[0].precios;
  it('antes del corte rige el precio promocional', () => {
    expect(tramoVigente(precios, ANTES).nombreTramo).toBe('Precio promocional');
  });
  it('el día del corte todavía es promocional (inclusive)', () => {
    expect(tramoVigente(precios, CORTE).nombreTramo).toBe('Precio promocional');
  });
  it('desde el día siguiente rige el precio de lista', () => {
    expect(tramoVigente(precios, DESPUES).nombreTramo).toBe('Precio de lista');
  });
});

describe('Congreso de prueba: matrícula por categoría', () => {
  const casos = [
    ['ninos_2_5', 2500, 5000],
    ['ninos_6_12', 2750, 5500],
    ['preadolescentes', 3000, 6000],
    ['adolescentes', 3250, 6500],
    ['jovenes', 3500, 7000],
    ['adultos', 3750, 7500],
  ];
  for (const [categoria, promo, lista] of casos) {
    it(`${categoria}: ${promo} promocional y ${lista} de lista`, () => {
      const r = { categoria, usa_transporte: 'no' };
      expect(calcularCobro(congreso, r, ANTES).total).toBe(promo);
      expect(calcularCobro(congreso, r, DESPUES).total).toBe(lista);
    });
  }
  it('el precio promocional es la mitad del de lista', () => {
    const [promo, lista] = congreso.conceptos[0].precios;
    for (const cat of Object.keys(lista.porCategoria)) {
      expect(promo.porCategoria[cat]).toBe(lista.porCategoria[cat] / 2);
    }
  });
});

describe('Congreso de prueba: transporte', () => {
  it('adolescente con transporte, antes del corte: 3250 + 3000', () => {
    const c = calcularCobro(congreso, { categoria: 'adolescentes', usa_transporte: 'si' }, ANTES);
    expect(c.total).toBe(6250);
    expect(c.detalle.map((d) => d.id)).toEqual(['matricula', 'transporte']);
  });
  it('adolescente con transporte, después del corte: 6500 + 3000 (transporte sin promoción)', () => {
    expect(calcularCobro(congreso, { categoria: 'adolescentes', usa_transporte: 'si' }, DESPUES).total).toBe(9500);
  });
  it('preadolescente con transporte paga 1000 de transporte', () => {
    expect(calcularCobro(congreso, { categoria: 'preadolescentes', usa_transporte: 'si' }, DESPUES).total).toBe(7000);
  });
  it('joven con transporte paga 3000 de transporte', () => {
    expect(calcularCobro(congreso, { categoria: 'jovenes', usa_transporte: 'si' }, ANTES).total).toBe(6500);
  });
  it('niños: el transporte es gratis pero queda registrado', () => {
    const c = calcularCobro(congreso, { categoria: 'ninos_2_5', usa_transporte: 'si' }, ANTES);
    expect(c.total).toBe(2500);
    expect(c.detalle.find((d) => d.id === 'transporte').monto).toBe(0);
  });
  it('sin transporte no se cobra transporte', () => {
    const c = calcularCobro(congreso, { categoria: 'jovenes', usa_transporte: 'no' }, ANTES);
    expect(c.detalle.map((d) => d.id)).toEqual(['matricula']);
  });
  it('adultos: no hay transporte aunque quede una respuesta vieja', () => {
    const c = calcularCobro(congreso, { categoria: 'adultos', usa_transporte: 'si' }, ANTES);
    expect(c.total).toBe(3750);
    expect(c.faltaDato).toBe(false);
  });
  it('si falta responder lo del transporte, avisa que falta un dato', () => {
    expect(calcularCobro(congreso, { categoria: 'jovenes' }, ANTES).faltaDato).toBe(true);
  });
  it('sin categoría no se puede calcular', () => {
    expect(calcularCobro(congreso, {}, ANTES).faltaDato).toBe(true);
  });
});

describe('Retiro de matrimonios', () => {
  it('se cobra solo la matrícula, viajen como viajen', () => {
    expect(calcularCobro(retiro, { colectivo: 'colectivo' }, ANTES).total).toBe(40000);
    expect(calcularCobro(retiro, { colectivo: 'propios' }, DESPUES).total).toBe(40000);
  });
});

describe('Fecha local de Argentina', () => {
  it('a las 23:30 de Argentina sigue siendo el mismo día (aunque en UTC ya sea el siguiente)', () => {
    // 22/10 02:30 UTC = 21/10 23:30 en Argentina
    expect(diaLocal(new Date('2026-10-22T02:30:00Z'))).toBe('2026-10-21');
  });
});
