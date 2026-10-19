import { nuevoBorrador, cambiarModalidad, armarDefinicion } from '../../src/logica/asistente.js';
const [modo, fecha] = process.argv.slice(2);
let b = { ...nuevoBorrador(), nombre: 'Congreso híbrido prueba', fecha };
b = cambiarModalidad(b, modo);
b = { ...b, cupoPresencial: '4', cierrePresencialPct: 100, conceptos: modo === 'hibrido' ? [
  { id: 'presencial', nombre: 'Matrícula presencial', aplicaSi: { campo: 'modalidad', igual: 'presencial' }, precios: [{ monto: '5000' }] },
  { id: 'virtual', nombre: 'Matrícula virtual', aplicaSi: { campo: 'modalidad', igual: 'virtual' }, precios: [{ monto: '2000' }] },
] : b.conceptos.map((k) => ({ ...k, precios: [{ monto: '1000' }] })) };
process.stdout.write(JSON.stringify(armarDefinicion(b)));
