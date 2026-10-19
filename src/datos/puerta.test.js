import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, guardarAjuste } from './db.js';
import { claveTokenSesion } from './sincronizacion.js';
import { buscar, normalizar, instanciaPropuesta, marcaVigente, contarPresentes, marcar, deshacer, sincronizarPuerta, borrarPuerta, leerPuerta } from './puerta.js';

const lista = [
  { id: 'a', n: 1, datos: { nombre: 'Laura Díaz', dni: '35.111.222' } },
  { id: 'b', n: 2, datos: { nombre: 'Mario Gómez Núñez', dni: '20111222' } },
  { id: 'c', n: 13, datos: { hombre: 'José Pérez', mujer: 'Ana Ríos', telefono: '3624-555666' } },
];

describe('Búsqueda en la puerta', () => {
  it('sin acentos ni mayúsculas, por partes del nombre y en cualquier orden', () => {
    expect(buscar(lista, 'gomez').map((x) => x.id)).toEqual(['b']);
    expect(buscar(lista, 'NUNEZ mar').map((x) => x.id)).toEqual(['b']);
    expect(buscar(lista, 'lau').map((x) => x.id)).toEqual(['a']);
  });
  it('por DNI con o sin puntos, parcial', () => {
    expect(buscar(lista, '35111').map((x) => x.id)).toEqual(['a']);
    expect(buscar(lista, '35.111.2').map((x) => x.id)).toEqual(['a']);
  });
  it('en parejas encuentra por el nombre de cualquiera de los dos o por teléfono', () => {
    expect(buscar(lista, 'ana rios').map((x) => x.id)).toEqual(['c']);
    expect(buscar(lista, 'jose').map((x) => x.id)).toEqual(['c']);
    expect(buscar(lista, '555666').map((x) => x.id)).toEqual(['c']);
  });
  it('por número de orden exacto', () => {
    expect(buscar(lista, '13').map((x) => x.id)).toEqual(['c']);
  });
  it('con menos de 2 letras no busca', () => {
    expect(buscar(lista, 'l')).toEqual([]);
    expect(normalizar('  ÁNGEL  Núñez ')).toBe('angel nunez');
  });
});

describe('Instancia que corresponde ahora', () => {
  const inst = [
    { id: 'sm', nombre: 'Sábado mañana', fecha: '2026-11-14', turno: 'mañana' },
    { id: 'st', nombre: 'Sábado tarde', fecha: '2026-11-14', turno: 'tarde' },
    { id: 'dm', nombre: 'Domingo mañana', fecha: '2026-11-15', turno: 'mañana' },
  ];
  it('elige la de hoy según la hora', () => {
    expect(instanciaPropuesta(inst, new Date('2026-11-14T12:00:00Z')).id).toBe('sm'); // 9 h
    expect(instanciaPropuesta(inst, new Date('2026-11-14T18:00:00Z')).id).toBe('st'); // 15 h
  });
  it('antes del evento, la próxima; después, la última', () => {
    expect(instanciaPropuesta(inst, new Date('2026-10-12T12:00:00Z')).id).toBe('sm');
    expect(instanciaPropuesta(inst, new Date('2026-12-01T12:00:00Z')).id).toBe('dm');
  });
});

describe('Marcas', () => {
  const m = [
    { id: '1', inscripcionId: 'a', instancia: 'x', persona: '', marcadaEn: '2026-11-14T12:05:00Z', estado: 'presente', marcadoPor: 'Lía' },
    { id: '2', inscripcionId: 'a', instancia: 'x', persona: '', marcadaEn: '2026-11-14T12:01:00Z', estado: 'presente', marcadoPor: 'Juan' },
    { id: '3', inscripcionId: 'b', instancia: 'x', persona: '', marcadaEn: '2026-11-14T12:02:00Z', estado: 'deshecha' },
    { id: '4', inscripcionId: 'c', instancia: 'x', persona: 'hombre', marcadaEn: '2026-11-14T12:02:00Z', estado: 'presente' },
  ];
  it('si dos marcaron a la misma persona, vale la primera hora', () => {
    expect(marcaVigente(m, 'a', 'x').marcadoPor).toBe('Juan');
    expect(marcaVigente(m, 'b', 'x')).toBeNull();
  });
  it('cuenta personas presentes sin duplicar y sin anuladas', () => {
    expect(contarPresentes(m, 'x', false)).toBe(2);
    expect(contarPresentes(m, 'x', false, new Set(['c']))).toBe(1);
  });
});

describe('Sincronización de la puerta', () => {
  beforeEach(async () => {
    await db.puerta.clear(); await db.marcas.clear(); await db.ajustes.clear();
    await guardarAjuste(claveTokenSesion('s1'), 'llave');
  });

  const servidor = (marcasServidor = []) => {
    const llamadas = [];
    const fn = async (url, op) => {
      const cuerpo = JSON.parse(op.body);
      llamadas.push({ url, cuerpo });
      if (url.endsWith('enviar_marcas')) {
        return { ok: true, json: async () => ({ ok: true, resultados: cuerpo.p_marcas.map((x) => ({ id: x.id, resultado: 'ok' })) }) };
      }
      return { ok: true, json: async () => ({ ok: true, ahora: '2026-11-14T12:10:00Z', asistencia: { instancias: [{ id: 'x' }] },
        inscripciones: [{ id: 'a', n: 1, datos: { nombre: 'Laura Díaz', dni: '35111222' }, anulada: false }], marcas: marcasServidor }) };
    };
    return { fn, llamadas };
  };

  it('marca sin internet, envía al volver y trae lo de los otros celulares', async () => {
    const mia = await marcar({ inscripcionId: 'a', instancia: 'x', sesionId: 's1', colaborador: 'Juan' });
    const caido = async () => { throw new TypeError('Failed to fetch'); };
    expect((await sincronizarPuerta('s1', caido)).sinConexion).toBe(true);
    expect((await db.marcas.get(mia.id)).envio).toBe('pendiente');

    const srv = servidor([{ id: 'otra', inscripcionId: 'a', instancia: 'x', persona: '', marcadaEn: '2020-01-01T12:00:00Z', marcadoPor: 'Lía', estado: 'presente' }]);
    await sincronizarPuerta('s1', srv.fn);
    expect(srv.llamadas[0].url).toMatch(/enviar_marcas$/);
    expect(srv.llamadas[1].cuerpo.p_desde).toBeNull();
    expect((await db.marcas.get(mia.id)).envio).toBe('enviada');
    const { inscripciones, marcas } = await leerPuerta();
    expect(inscripciones[0].busqueda).toBe('laura diaz 35111222');
    expect(marcaVigente(marcas, 'a', 'x').marcadoPor).toBe('Lía'); // la de Lía fue antes

    await sincronizarPuerta('s1', srv.fn);
    expect(srv.llamadas.at(-1).cuerpo.p_desde).toBe('2026-11-14T12:10:00Z'); // después pide solo lo que cambió
  });

  it('deshacer se envía como «deshecha»', async () => {
    const m = await marcar({ inscripcionId: 'a', instancia: 'x', sesionId: 's1', colaborador: 'Juan' });
    await deshacer(m.id);
    const srv = servidor();
    await sincronizarPuerta('s1', srv.fn);
    expect(srv.llamadas[0].cuerpo.p_marcas[0].estado).toBe('deshecha');
  });

  it('al terminar se borra la lista del celular pero no lo pendiente', async () => {
    await db.puerta.put({ id: 'a', n: 1, datos: { nombre: 'X' } });
    await db.marcas.put({ id: 'e', envio: 'enviada', inscripcionId: 'a' });
    await db.marcas.put({ id: 'p', envio: 'pendiente', inscripcionId: 'a' });
    await borrarPuerta();
    expect(await db.puerta.count()).toBe(0);
    expect((await db.marcas.toArray()).map((x) => x.id)).toEqual(['p']);
  });
});
