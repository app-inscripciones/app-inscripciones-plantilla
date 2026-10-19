// Etapa 9 · Evento de práctica (D56): para capacitar a los voluntarios sin tocar datos reales.
// Se arma con el mismo asistente que un evento real, así el voluntario practica exactamente lo que va a hacer:
// categorías (el precio cambia según la que elige), transporte que se cobra aparte, un dato de salud,
// medio de pago y control de presentes una vez por día. Dura una semana y después se borra solo.
import { nuevoBorrador, alternarPregunta, armarDefinicion, PREGUNTAS_COMUNES, SUGERENCIA_CATEGORIAS } from './asistente.js';

export const DIAS_PRACTICA = 7;

const sumarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// hoy: AAAA-MM-DD (día local de la institución).
export function definicionPractica(hoy) {
  let b = nuevoBorrador(); // ya trae nombre, DNI y teléfono
  for (const id of ['edad', 'transporte', 'restricciones']) b = alternarPregunta(b, PREGUNTAS_COMUNES.find((p) => p.id === id));
  const precios = { ninos: 1000, adolescentes: 2000, jovenes: 3000, adultos: 4000 };
  b = {
    ...b,
    nombre: `Evento de práctica ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`,
    fecha: hoy,
    fechaFin: sumarDias(hoy, DIAS_PRACTICA - 1),
    usaCategorias: true,
    categorias: SUGERENCIA_CATEGORIAS.map((c) => ({ ...c })),
    conceptos: [
      { id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ porCategoria: precios }] },
      { id: 'transporte', nombre: 'Transporte', aplicaSi: { campo: 'transporte', igual: 'si' }, precios: [{ monto: 500 }] },
    ],
    asistencia: { ...b.asistencia, toma: true, modo: 'dias' },
  };
  return armarDefinicion(b);
}

export const esPractica = (evento) => !!(evento && evento.practica);
