// Reglas de la configuración de un evento: cuándo se muestra un campo y
// cuándo se cobra un concepto. Las condiciones se escriben en el JSON del evento:
//   { "campo": "x", "igual": "si" }
//   { "campo": "x", "en": ["a", "b"] }
//   { "todas": [ ...condiciones ] }
// Una condición vacía (null) siempre se cumple.

export function cumpleCondicion(condicion, respuestas) {
  if (!condicion) return true;
  if (Array.isArray(condicion.todas)) {
    return condicion.todas.every((c) => cumpleCondicion(c, respuestas));
  }
  const valor = respuestas[condicion.campo];
  if ('igual' in condicion) return valor === condicion.igual;
  if (Array.isArray(condicion.en)) return condicion.en.includes(valor);
  return false;
}

export function campoVisible(campo, respuestas) {
  return cumpleCondicion(campo.visibleSi, respuestas);
}

import { esGrupo, camposDelGrupo, camposDeIntegrante, respuestasDeIntegrante } from './grupo.js';

// Deja solo las respuestas de los campos visibles, para no guardar datos
// de preguntas que quedaron ocultas (por ejemplo, si cambió la categoría).
// En los grupos (D61): las respuestas del grupo y, aparte, las de cada integrante (con su id y si es el responsable).
export function limpiarRespuestas(evento, respuestas) {
  if (esGrupo(evento)) {
    const { integrantes = [], ...delGrupo } = respuestas || {};
    const comoPersona = (campos, categorias) => ({ ...evento, unidad: 'persona', campos, categorias });
    return {
      ...limpiarRespuestas(comoPersona(camposDelGrupo(evento), []), delGrupo),
      integrantes: integrantes.map((x) => ({
        id: x.id,
        ...(x.responsable ? { responsable: true } : {}),
        ...limpiarRespuestas(comoPersona(camposDeIntegrante(evento), evento.categorias), { ...respuestasDeIntegrante(delGrupo, x), categoria: x.categoria }),
      })),
    };
  }
  const limpias = {};
  if (evento.categorias.length > 0 && respuestas.categoria) {
    limpias.categoria = respuestas.categoria;
  }
  for (const campo of evento.campos) {
    if (campoVisible(campo, respuestas) && respuestas[campo.id] !== undefined && respuestas[campo.id] !== '') {
      limpias[campo.id] = respuestas[campo.id];
    }
  }
  return limpias;
}
