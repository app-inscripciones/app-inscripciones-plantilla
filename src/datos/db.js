import Dexie from 'dexie';

// Base de datos local del dispositivo (IndexedDB).
// Cada inscripción se guarda aquí PRIMERO. En la Etapa 2 se agrega el envío
// automático a la base central; mientras tanto quedan en estado "pendiente".
export const db = new Dexie('inscripciones');

db.version(1).stores({
  inscripciones: 'id, eventoId, estado, creadaEn, [eventoId+cargador]',
  ajustes: 'clave',
});
// Etapa 4B: lista de la puerta (control de presentes) y marcas de «Presente».
db.version(2).stores({
  inscripciones: 'id, eventoId, estado, creadaEn, [eventoId+cargador]',
  ajustes: 'clave',
  puerta: 'id',
  marcas: 'id, inscripcionId, envio, sesionId',
});

// Pide al navegador que no borre estos datos para liberar espacio.
export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* algunos navegadores no lo permiten */
  }
  return false;
}

export function nuevoId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Guarda y vuelve a leer para confirmar que quedó escrito.
export async function guardarInscripcion(inscripcion) {
  await db.inscripciones.add(inscripcion);
  const leida = await db.inscripciones.get(inscripcion.id);
  if (!leida) throw new Error('No se pudo confirmar el guardado en el dispositivo.');
  return leida;
}

export function inscripcionesDelEvento(eventoId) {
  return db.inscripciones.where('eventoId').equals(eventoId).reverse().sortBy('creadaEn');
}

// Resumen del cargador para rendir: todo lo cargado en este dispositivo,
// incluidas las inscripciones todavía no enviadas.
export async function resumenCargador(eventoId, cargador) {
  const lista = await db.inscripciones.where('[eventoId+cargador]').equals([eventoId, cargador]).toArray();
  const activas = lista.filter((i) => i.estado !== 'anulada');
  const porMedio = { efectivo: 0, terminal: 0, transferencia: 0, sin_cobro: 0 };
  const cantidadPorMedio = { efectivo: 0, terminal: 0, transferencia: 0, sin_cobro: 0 };
  for (const i of activas) {
    porMedio[i.pago.medio] += i.monto;
    cantidadPorMedio[i.pago.medio] += 1;
  }
  // D60: cada cobro con terminal deja un ticket en papel que también se entrega al Tesorero.
  const nombre = (i) => (i.datos && (i.datos.nombre_grupo || i.datos.nombre || [i.datos.hombre, i.datos.mujer].filter(Boolean).join(' y '))) || 'Sin nombre';
  const ticketsTerminal = activas.filter((i) => i.pago.medio === 'terminal')
    .sort((a, b) => String(a.creadaEn).localeCompare(String(b.creadaEn)))
    .map((i) => ({ id: i.id, nombre: nombre(i), monto: i.monto, creadaEn: i.creadaEn }));
  return {
    ticketsTerminal,
    cantidad: activas.length,
    total: activas.reduce((s, i) => s + i.monto, 0),
    porMedio,
    cantidadPorMedio,
    pendientes: activas.filter((i) => i.estado !== 'sincronizado').length,
  };
}

export async function leerAjuste(clave) {
  const fila = await db.ajustes.get(clave);
  return fila ? fila.valor : null;
}

export function guardarAjuste(clave, valor) {
  return db.ajustes.put({ clave, valor });
}
