// Definiciones de eventos por grupo armadas con la misma lógica del asistente (src/logica/asistente.js).
// Uso: node defgrupo.mjs torneo|familias|hibrido FECHA
//  · torneo:   equipos de 5 a 6, un precio por equipo ($50.000), DNI de cada jugador, asistencia del equipo junto.
//  · familias: familias de 2 a 8, según cada integrante (Niños $2.000 / Adultos $5.000) + transporte $1.000 a cada uno
//              si la familia viaja; edad y DNI de cada integrante; asistencia por integrante.
//  · persona:  evento por persona (para comparar), $1.000, DNI y teléfono.
//  · hibrido:  equipos de 2 a 4, híbrido con cupo presencial de 6 personas, cierre al 100 %, $1.000 por equipo.
import { nuevoBorrador, cambiarUnidad, cambiarGrupo, cambiarModalidad, alternarPregunta, PREGUNTAS_COMUNES, armarDefinicion } from '../../src/logica/asistente.js';

const [modo, fecha] = process.argv.slice(2);
const pregunta = (id) => PREGUNTAS_COMUNES.find((p) => p.id === id);
let b = { ...nuevoBorrador(), fecha };
if (modo !== 'persona') b = cambiarUnidad(b, 'grupo');
if (modo === 'persona') {
  b = { ...b, nombre: 'Culto prueba', conceptos: [{ id: 'matricula', nombre: 'Entrada', aplicaSi: null, precios: [{ monto: '1000' }] }] };
} else if (modo === 'familias') {
  b = { ...b, nombre: 'Retiro de familias prueba', usaCategorias: true,
    categorias: [{ id: 'ninos', nombre: 'Niños', edadMin: 0, edadMax: 12 }, { id: 'adultos', nombre: 'Adultos', edadMin: 13, edadMax: 120 }] };
  b = cambiarGrupo(b, { nombre: 'familia', min: 2, max: 8, cobro: 'integrante' });
  b = alternarPregunta(b, pregunta('edad'));
  b = alternarPregunta(b, pregunta('transporte'));
  b = { ...b, conceptos: [
    { id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ porCategoria: { ninos: '2000', adultos: '5000' } }] },
    { id: 'transporte', nombre: 'Transporte', aplicaSi: { campo: 'transporte', igual: 'si' }, precios: [{ monto: '1000' }] },
  ], asistencia: { ...b.asistencia, modoPareja: 'individual' } };
} else if (modo === 'hibrido') {
  b = { ...b, nombre: 'Torneo híbrido prueba' };
  b = cambiarGrupo(b, { nombre: 'equipo', min: 2, max: 4, cobro: 'grupo' });
  b = cambiarModalidad(b, 'hibrido');
  b = { ...b, cupoPresencial: '6', cierrePresencialPct: 100, conceptos: [{ id: 'matricula', nombre: 'Inscripción del equipo', aplicaSi: null, precios: [{ monto: '1000' }] }] };
} else {
  b = { ...b, nombre: 'Torneo de fútbol prueba' };
  b = cambiarGrupo(b, { nombre: 'equipo', min: 5, max: 6, cobro: 'grupo' });
  b = { ...b, conceptos: [{ id: 'matricula', nombre: 'Inscripción del equipo', aplicaSi: null, precios: [{ monto: '50000' }] }] };
}
process.stdout.write(JSON.stringify(armarDefinicion(b)));
