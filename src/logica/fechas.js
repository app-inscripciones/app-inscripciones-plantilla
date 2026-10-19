import institucion from '../../config/institucion.json';

// Devuelve la fecha del día (AAAA-MM-DD) en la zona horaria de la institución.
// Es la fecha que define el tramo de precio (precio anticipado o de lista).
export function diaLocal(fecha = new Date(), zona = institucion.zonaHoraria) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const v = (t) => partes.find((p) => p.type === t).value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}

// Fecha y hora en formato argentino de 24 h: «12/10/2026 19:04».
export function formatoFechaHora(iso, zona = institucion.zonaHoraria) {
  const p = new Intl.DateTimeFormat('es-AR', {
    timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t) => (p.find((x) => x.type === t) || {}).value || '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

export function formatoDia(dia) {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

// Horario de un acceso en palabras simples: «lun 12/10 de 17:30 a 21:30».
export function formatoHorario(desde, hasta, zona = institucion.zonaHoraria) {
  const partes = (iso) => {
    const p = new Intl.DateTimeFormat('es-AR', {
      timeZone: zona, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const v = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return { dia: `${v('weekday').replace('.', '')} ${v('day')}/${v('month')}`, hora: `${v('hour')}:${v('minute')}` };
  };
  const a = partes(desde);
  const b = partes(hasta);
  return a.dia === b.dia ? `${a.dia} de ${a.hora} a ${b.hora}` : `${a.dia} ${a.hora} a ${b.dia} ${b.hora}`;
}

// Nombre del evento con su fecha, para distinguir eventos parecidos en las listas (D63): «Jornada · 16/10/2026».
export function etiquetaEvento(e) {
  if (!e) return '';
  const fecha = e.fecha && /^\d{4}-\d{2}-\d{2}/.test(e.fecha) ? ` · ${formatoDia(e.fecha.slice(0, 10))}` : '';
  return `${e.practica ? '🧪 ' : ''}${e.nombre}${fecha}`;
}

export { nombreNormal } from './textos.js';
