// Inscripción por grupo (R19, D61).
// La definición del evento lleva  grupo: { nombre ('equipo', 'familia'…), min, max, cobro ('grupo' | 'integrante') }.
// Las preguntas con  porIntegrante: true  se piden para cada integrante; las demás, una vez por grupo.
// Las respuestas de un grupo: { nombre_grupo, telefono, …, integrantes: [{ id:'i1', responsable:true, nombre, dni, categoria, … }] }.
// La unidad de inscripción no es lo mismo que la cantidad de personas: un grupo ocupa tantos lugares como integrantes tenga.

export const LIMITE_INTEGRANTES = 50;

export const esGrupo = (evento) => !!evento && evento.unidad === 'grupo';
export const camposDelGrupo = (evento) => evento.campos.filter((c) => !c.porIntegrante);
export const camposDeIntegrante = (evento) => evento.campos.filter((c) => c.porIntegrante);

// Cuántas personas son en una inscripción (persona 1, pareja 2, grupo = integrantes).
export function personasDe(evento, datos) {
  if (!evento) return 1;
  if (evento.unidad === 'pareja') return 2;
  if (evento.unidad === 'grupo') return Math.max(1, ((datos && datos.integrantes) || []).length);
  return 1;
}

// Nombre del tipo de grupo, en singular y plural, para los textos («equipo» / «equipos»).
// Femenino si termina en «a» o en «ión» (familia, banda, comisión); si no, masculino (equipo, grupo).
export const esFemenino = (n) => /(a|ión|ion|dad)$/.test(String(n || '').trim().toLowerCase());
export function nombreGrupo(evento) {
  const n = String((evento && evento.grupo && evento.grupo.nombre) || 'grupo').trim().toLowerCase() || 'grupo';
  const plural = /[aeiouáéó]$/.test(n) ? `${n}s` : /z$/.test(n) ? `${n.slice(0, -1)}ces` : /ión$/.test(n) ? `${n.slice(0, -3)}iones` : `${n}es`;
  const f = esFemenino(n);
  return {
    singular: n, plural, Singular: n[0].toUpperCase() + n.slice(1), Plural: plural[0].toUpperCase() + plural.slice(1),
    el: f ? 'la' : 'el', del: f ? 'de la' : 'del', un: f ? 'una' : 'un', cada: 'cada', todo: f ? 'toda' : 'todo', junto: f ? 'junta' : 'junto',
  };
}

// Id del integrante: i1, i2… (no se reutiliza dentro de una inscripción, así la asistencia por integrante no se confunde).
export function nuevoIntegrante(integrantes = []) {
  const max = integrantes.reduce((m, x) => Math.max(m, Number(String(x.id || '').slice(1)) || 0), 0);
  return { id: `i${max + 1}`, ...(integrantes.length === 0 ? { responsable: true } : {}) };
}

// Las respuestas de un integrante «vistas» con las del grupo (para condiciones y precios).
export const respuestasDeIntegrante = (grupo, integrante) => {
  const { integrantes, ...delGrupo } = grupo || {};
  const { id, responsable, ...propias } = integrante || {};
  return { ...delGrupo, ...propias };
};

export const nombreDeInscripcion = (datos) => {
  if (!datos) return '';
  if (datos.nombre_grupo) return datos.nombre_grupo;
  if (datos.nombre) return datos.nombre;
  return [datos.hombre, datos.mujer].filter(Boolean).join(' y ');
};

export const responsableDe = (datos) => ((datos && datos.integrantes) || []).find((x) => x.responsable) || null;
