import { describe, it, expect } from 'vitest';
import {
  nuevoBorrador, armarDefinicion, revisarDefinicion, momentosAsistencia, cambiarUnidad, alternarPregunta,
  PREGUNTAS_COMUNES, desdeEvento, diasEntre, resumenSimple, idDesde,
} from './asistente.js';
import { calcularCobro } from './precios.js';
import { validar } from './validacion.js';
import congreso from '../eventos/congreso-prueba.json';
import retiro from '../eventos/retiro-matrimonios.json';

const HOY = '2026-10-12';
const pregunta = (id) => PREGUNTAS_COMUNES.find((p) => p.id === id);

function campamento() {
  let b = nuevoBorrador();
  b = { ...b, nombre: 'Campamento de jóvenes', fecha: '2027-01-15', fechaFin: '2027-01-17' };
  b = alternarPregunta(b, pregunta('transporte'));
  b = {
    ...b,
    usaCategorias: true,
    categorias: [
      { id: 'ninos', nombre: 'Niños', edadMin: 0, edadMax: 12 },
      { id: 'adultos', nombre: 'Adultos', edadMin: 13, edadMax: 120 },
    ],
    conceptos: [
      { id: 'matricula', nombre: 'Matrícula', aplicaSi: null,
        precios: [{ hasta: '2026-12-15', porCategoria: { ninos: '1000', adultos: '2000' } }, { porCategoria: { ninos: '1500', adultos: '3000' } }] },
      { id: 'transporte', nombre: 'Transporte', aplicaSi: { campo: 'transporte', igual: 'si' }, precios: [{ monto: '500' }] },
    ],
  };
  return b;
}

describe('asistente de eventos', () => {
  it('un borrador nuevo tiene errores hasta completar nombre, fecha y precio', () => {
    const { errores } = revisarDefinicion(nuevoBorrador(), HOY);
    const pasos = errores.map((e) => e.paso);
    expect(pasos).toContain('nombre');
    expect(pasos).toContain('fechas');
    expect(pasos).toContain('cobro');
  });

  it('arma una definición que el formulario y los precios entienden', () => {
    const { errores, definicion: ev } = revisarDefinicion(campamento(), HOY);
    expect(errores).toEqual([]);
    expect(ev.conceptos[0].precios[0]).toEqual({ hasta: '2026-12-15', nombreTramo: 'Precio anticipado', porCategoria: { ninos: 1000, adultos: 2000 } });
    const r = { categoria: 'adultos', nombre: 'Ana Pérez', dni: '30111222', telefono: '3624111222', transporte: 'si' };
    expect(calcularCobro(ev, r, '2026-12-01').total).toBe(2500);
    expect(calcularCobro(ev, r, '2026-12-16').total).toBe(3500);
    expect(calcularCobro(ev, { ...r, transporte: 'no' }, '2026-12-16').total).toBe(3000);
    expect(validar(ev, r, { medio: 'efectivo' })).toEqual({});
  });

  it('momentos de asistencia según la opción elegida (D30)', () => {
    const b = campamento();
    expect(momentosAsistencia(b)).toEqual([{ id: 'llegada', nombre: 'Llegada', fecha: '2027-01-15' }]);
    const dias = momentosAsistencia({ ...b, asistencia: { ...b.asistencia, modo: 'dias' } });
    expect(dias.map((m) => m.id)).toEqual(['dia-2027-01-15', 'dia-2027-01-16', 'dia-2027-01-17']);
    expect(dias[0].nombre).toBe('Viernes 15/01');
    const turnos = momentosAsistencia({ ...b, asistencia: { ...b.asistencia, modo: 'turnos', turnos: ['noche', 'mañana'] } });
    expect(turnos).toHaveLength(6);
    expect(turnos[1]).toEqual({ id: '2027-01-15-noche', nombre: 'Viernes 15/01 – noche', fecha: '2027-01-15', turno: 'noche' });
    const manual = momentosAsistencia({ ...b, asistencia: { ...b.asistencia, modo: 'manual', elegidos: ['2027-01-16|tarde', '2027-01-15|', '2030-01-01|'] } });
    expect(manual.map((m) => m.id)).toEqual(['dia-2027-01-15', '2027-01-16-tarde']);
    expect(momentosAsistencia({ ...b, asistencia: { ...b.asistencia, modo: 'no' } })).toEqual([]);
    const { errores } = revisarDefinicion({ ...b, asistencia: { ...b.asistencia, modo: 'manual', elegidos: [] } }, HOY);
    expect(errores.map((e) => e.paso)).toEqual(['asistencia']);
  });

  it('en pareja usa los nombres que entienden la puerta y el panel', () => {
    const b = cambiarUnidad(campamento(), 'pareja');
    const ev = armarDefinicion(b);
    expect(ev.campos.slice(0, 2).map((c) => c.id)).toEqual(['hombre', 'mujer']);
    expect(ev.campos.some((c) => c.id === 'dni')).toBe(false); // el DNI único es solo por persona
    expect(ev.asistencia.modoPareja).toBe('pareja');
    expect(ev.asistencia.camposBusqueda).toEqual(['hombre', 'mujer', 'telefono']);
    const vuelta = armarDefinicion(cambiarUnidad(b, 'persona'));
    expect(vuelta.campos[0].id).toBe('nombre');
    expect(vuelta.asistencia.modoPareja).toBe(null);
  });

  it('quitar una pregunta borra la condición de cobro que dependía de ella', () => {
    const b = alternarPregunta(campamento(), pregunta('transporte'));
    expect(armarDefinicion(b).conceptos[1].aplicaSi).toBe(null);
  });

  it('avisa lo que suele olvidarse sin impedir abrir', () => {
    let b = campamento();
    b = alternarPregunta(b, pregunta('telefono'));
    b = { ...b, conceptos: [{ ...b.conceptos[0], precios: [{ hasta: '2026-12-15', porCategoria: { ninos: 2000, adultos: 2000 } }, { porCategoria: { ninos: 1500 } }] }] };
    const { errores, recordatorios } = revisarDefinicion(b, HOY);
    expect(errores).toEqual([]);
    const textos = recordatorios.map((r) => r.texto).join(' | ');
    expect(textos).toMatch(/No pedís teléfono/);
    expect(textos).toMatch(/restricciones alimentarias/);
    expect(textos).toMatch(/no tiene precio para Adultos/);
    expect(textos).toMatch(/anticipado es más caro/);
  });

  it('errores comunes: fecha pasada, precio vacío, opciones incompletas', () => {
    const b = campamento();
    b.fecha = '2026-01-01';
    b.fechaFin = '';
    b.conceptos[1].precios[0].monto = '';
    b.campos.push({ id: 'p_talle', etiqueta: 'Talle de remera', tipo: 'opcion', obligatorio: true, opciones: [{ valor: 's', etiqueta: 'S' }] });
    const textos = revisarDefinicion(b, HOY).errores.map((e) => e.texto);
    expect(textos).toContain('La fecha del evento ya pasó.');
    expect(textos.some((t) => t.includes('«Transporte»: escribí el precio'))).toBe(true);
    expect(textos.some((t) => t.includes('Talle de remera'))).toBe(true);
  });

  it('copiar de los eventos modelo da un borrador válido al completar nombre y fechas', () => {
    for (const modelo of [congreso, retiro]) {
      const b = { ...desdeEvento(modelo), nombre: 'Copia', fecha: '2027-03-01', fechaFin: '2027-03-02' };
      b.conceptos = b.conceptos.map((k) => ({ ...k, precios: k.precios.map((t, n) => (n < k.precios.length - 1 ? { ...t, hasta: '2027-02-01' } : t)) }));
      const { errores, definicion } = revisarDefinicion(b, HOY);
      expect(errores).toEqual([]);
      expect(definicion.campos.map((c) => c.id)).toEqual(modelo.campos.map((c) => c.id));
      expect(definicion.unidad).toBe(modelo.unidad);
    }
  });

  it('resumen en palabras simples', () => {
    const t = resumenSimple(armarDefinicion(campamento())).join('\n');
    expect(t).toMatch(/va del viernes 15\/01\/2027 al domingo 17\/01\/2027/);
    expect(t).toMatch(/solo si en «¿Viaja en el transporte del evento\?» responde «Sí»/);
    expect(t).toMatch(/Se toma asistencia una vez: Llegada/);
  });

  it('auxiliares', () => {
    expect(diasEntre('2027-02-27', '2027-03-01')).toEqual(['2027-02-27', '2027-02-28', '2027-03-01']);
    expect(idDesde('¿Talle de remera?', [], 'p_')).toBe('p_talle_de_remera');
    expect(idDesde('DNI', ['x'])).toBe('dni_2');
  });
});

describe('dato para reconocer en la puerta', () => {
  it('por defecto usa el lugar de origen; se puede elegir «Nada más»', () => {
    let b = alternarPregunta(campamento(), pregunta('procedencia'));
    expect(armarDefinicion(b).asistencia.campoProcedencia).toBe('procedencia');
    b = { ...b, asistencia: { ...b.asistencia, campoProcedencia: '' } };
    expect(armarDefinicion(b).asistencia.campoProcedencia).toBe(null);
  });
});

describe('evento sin cobro (D45)', () => {
  it('no tiene conceptos, no pide pago y se puede abrir', () => {
    const b = { ...campamento(), sinCobro: true };
    const { errores, definicion } = revisarDefinicion(b, HOY);
    expect(errores).toEqual([]);
    expect(definicion.conceptos).toEqual([]);
    expect(definicion.sinCobro).toBe(true);
    expect(validar(definicion, { categoria: 'ninos', nombre: 'Ana', dni: '30111222', telefono: '3624111222', transporte: 'no' }, { medio: '' })).toEqual({});
    expect(resumenSimple(definicion).join(' ')).toMatch(/evento gratuito/);
    const copia = desdeEvento(definicion);
    expect(copia.sinCobro).toBe(true);
    expect(copia.conceptos.length).toBe(1);
  });
});

describe('edades de las categorías', () => {
  const conCats = (categorias) => ({ ...campamento(), categorias, conceptos: [{ id: 'm', nombre: 'Matrícula', aplicaSi: null, precios: [{ monto: 100 }] }] });
  it('avisa si dos categorías se superponen (no deja seguir)', () => {
    const { errores } = revisarDefinicion(conCats([
      { id: 'a', nombre: 'Adultos', edadMin: 31, edadMax: 60 }, { id: 'm', nombre: 'Adultos mayores', edadMin: 60, edadMax: 120 },
    ]), HOY);
    expect(errores.map((x) => x.texto)).toContain('«Adultos» (31 a 60) y «Adultos mayores» (60 a 120) se superponen: ¿en cuál va alguien de 60 años? Corregí las edades.');
  });
  it('recuerda las edades que quedan sin categoría (sin impedir seguir)', () => {
    const { errores, recordatorios } = revisarDefinicion(conCats([
      { id: 'j', nombre: 'Jóvenes', edadMin: 18, edadMax: 30 }, { id: 'a', nombre: 'Adultos', edadMin: 35, edadMax: 120 },
    ]), HOY);
    expect(errores).toEqual([]);
    expect(recordatorios.map((x) => x.texto)).toContain('Nadie de 31 a 34 años tiene categoría (entre «Jóvenes» y «Adultos»).');
  });
});
