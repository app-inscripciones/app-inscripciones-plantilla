// D51: compara el cálculo del monto de la app (src/logica/precios.js) con el de la base (calcular_monto)
// en miles de casos al azar. Escribe un SQL que devuelve las diferencias (debe devolver 0 filas).
import { writeFileSync } from 'node:fs';
import { calcularCobro } from '../../src/logica/precios.js';
import { armarDefinicion, nuevoBorrador, alternarPregunta, PREGUNTAS_COMUNES } from '../../src/logica/asistente.js';
import congreso from '../../src/eventos/congreso-prueba.json' with { type: 'json' };
import retiro from '../../src/eventos/retiro-matrimonios.json' with { type: 'json' };

let semilla = 11;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const uno = (l) => l[Math.floor(azar() * l.length)];

let b = { ...nuevoBorrador(), nombre: 'Campamento', fecha: '2027-01-15', fechaFin: '2027-01-17', usaCategorias: true,
  categorias: [{ id: 'ninos', nombre: 'Niños', edadMin: 0, edadMax: 12 }, { id: 'adultos', nombre: 'Adultos', edadMin: 13, edadMax: 120 }] };
b = alternarPregunta(b, PREGUNTAS_COMUNES.find((p) => p.id === 'transporte'));
b.campos.push({ id: 'p_remera', etiqueta: '¿Quiere remera?', tipo: 'si_no', obligatorio: true, visibleSi: { campo: 'categoria', en: ['adultos'] } });
b.conceptos = [
  { id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ hasta: '2026-12-15', porCategoria: { ninos: 1000, adultos: 2000 } }, { porCategoria: { ninos: 1500, adultos: 3000 } }] },
  { id: 'transporte', nombre: 'Transporte', aplicaSi: { campo: 'transporte', igual: 'si' }, precios: [{ monto: 500 }] },
  { id: 'remera', nombre: 'Remera', aplicaSi: { todas: [{ campo: 'p_remera', igual: 'si' }, { campo: 'categoria', en: ['adultos'] }] }, precios: [{ hasta: '2026-11-30', monto: 700 }, { monto: 900 }] },
];
const campamento = armarDefinicion(b);
const eventos = [congreso, retiro, campamento];
const dias = ['2026-10-01', '2026-10-21', '2026-10-22', '2026-11-30', '2026-12-01', '2026-12-15', '2026-12-16', '2027-01-20'];

const filas = [];
for (let n = 0; n < 3000; n++) {
  const ev = uno(eventos);
  const r = {};
  if (ev.categorias.length) r.categoria = uno(ev.categorias).id;
  for (const c of ev.campos) {
    if (azar() < 0.1) continue; // a veces falta una respuesta
    if (c.tipo === 'si_no') r[c.id] = uno(['si', 'no']);
    else if (c.tipo === 'opcion') r[c.id] = uno(c.opciones).valor;
    else r[c.id] = 'x';
  }
  const dia = uno(dias);
  const { total, faltaDato } = calcularCobro(ev, r, dia);
  const { categoria, ...datos } = r;
  filas.push({ n, ev: ev.id || 'campamento', def: ev, categoria: categoria || null, datos, dia, esperado: faltaDato && !categoria && ev.categorias.length ? null : total });
}
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
let sql = 'create temp table casos (n int, def jsonb, categoria text, datos jsonb, dia date, esperado int);\ninsert into casos values\n';
sql += filas.map((f) => `(${f.n}, ${lit(f.def)}, ${f.categoria ? `'${f.categoria}'` : 'null'}, ${lit(f.datos)}, '${f.dia}', ${f.esperado ?? 'null'})`).join(',\n') + ';\n';
sql += `select count(*) as casos, count(*) filter (where public.calcular_monto(def, categoria, datos, dia) is distinct from esperado) as diferencias from casos;\n`;
sql += `select n, categoria, datos, dia, esperado, public.calcular_monto(def, categoria, datos, dia) as base from casos where public.calcular_monto(def, categoria, datos, dia) is distinct from esperado limit 5;\n`;
writeFileSync('/tmp/comparar_monto.sql', sql);
console.log(`${filas.length} casos escritos`);
