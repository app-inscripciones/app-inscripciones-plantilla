import { cumpleCondicion, campoVisible, limpiarRespuestas } from './reglas.js';
import { esGrupo, camposDelGrupo, respuestasDeIntegrante } from './grupo.js';

// Elige el tramo de precio según el día de la inscripción.
// Los tramos están en orden; un tramo con "hasta" vale hasta ese día inclusive.
// El último tramo (sin "hasta") vale para cualquier fecha posterior.
export function tramoVigente(precios, dia) {
  for (const tramo of precios) {
    if (!tramo.hasta || dia <= tramo.hasta) return tramo;
  }
  return null;
}

function montoDelTramo(tramo, categoria) {
  if (!tramo) return null;
  if (typeof tramo.monto === 'number') return tramo.monto;
  if (tramo.porCategoria) {
    const monto = tramo.porCategoria[categoria];
    return typeof monto === 'number' ? monto : null;
  }
  return null;
}

// Calcula lo que corresponde cobrar. Devuelve el detalle por concepto y el total.
// "faltaDato" indica que todavía no se puede calcular (por ejemplo, falta elegir categoría).
export function calcularCobro(evento, respuestasCrudas, dia) {
  if (esGrupo(evento)) return calcularCobroGrupo(evento, respuestasCrudas, dia);
  // Solo cuentan las respuestas de preguntas visibles.
  const respuestas = limpiarRespuestas(evento, respuestasCrudas);
  const detalle = [];
  let faltaDato = false;

  if (evento.categorias.length > 0 && !respuestas.categoria) {
    return { detalle: [], total: 0, faltaDato: true };
  }

  const camposCondicion = (c) => (!c ? [] : c.todas ? c.todas.flatMap(camposCondicion) : [c.campo]);

  for (const concepto of evento.conceptos) {
    // Si la condición depende de una pregunta visible que todavía no se respondió,
    // no se puede saber si corresponde cobrar este concepto.
    const pendiente = camposCondicion(concepto.aplicaSi).some((id) => {
      const campo = evento.campos.find((f) => f.id === id);
      return campo && campoVisible(campo, respuestas) && (respuestas[id] === undefined || respuestas[id] === '');
    });
    if (pendiente) {
      faltaDato = true;
      continue;
    }
    if (!cumpleCondicion(concepto.aplicaSi, respuestas)) continue;

    const tramo = tramoVigente(concepto.precios, dia);
    const monto = montoDelTramo(tramo, respuestas.categoria);
    if (monto === null) continue; // el concepto no existe para esta categoría
    detalle.push({
      id: concepto.id,
      nombre: concepto.nombre,
      tramo: tramo.nombreTramo || null,
      monto,
    });
  }

  const total = detalle.reduce((suma, d) => suma + d.monto, 0);
  return { detalle, total, faltaDato };
}

// Grupos (D61): «un precio por grupo» (con las respuestas del grupo, sin categorías) o
// «según cada integrante» (la suma de lo de cada uno: respuestas del grupo + las suyas, con su categoría).
// Igual que calcular_monto_inscripcion en la base (supabase/018_grupos.sql).
function calcularCobroGrupo(evento, respuestas, dia) {
  const { integrantes = [], ...delGrupo } = respuestas || {};
  const comoPersona = { ...evento, unidad: 'persona' };
  if ((evento.grupo && evento.grupo.cobro) === 'integrante') {
    if (integrantes.length === 0) return { detalle: [], total: 0, faltaDato: true };
    const porConcepto = new Map();
    let faltaDato = false;
    for (const x of integrantes) {
      const c = calcularCobro(comoPersona, { ...respuestasDeIntegrante(delGrupo, x), categoria: x.categoria }, dia);
      if (c.faltaDato) faltaDato = true;
      for (const d of c.detalle) {
        const clave = `${d.id}|${d.tramo || ''}`;
        const previo = porConcepto.get(clave);
        porConcepto.set(clave, previo ? { ...previo, monto: previo.monto + d.monto, cantidad: previo.cantidad + 1 } : { ...d, cantidad: 1 });
      }
    }
    if (faltaDato) return { detalle: [], total: 0, faltaDato: true };
    const detalle = [...porConcepto.values()];
    return { detalle, total: detalle.reduce((s, d) => s + d.monto, 0), faltaDato: false };
  }
  return calcularCobro({ ...comoPersona, categorias: [], campos: camposDelGrupo(evento) }, delGrupo, dia);
}

export function formatoPesos(monto) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}
