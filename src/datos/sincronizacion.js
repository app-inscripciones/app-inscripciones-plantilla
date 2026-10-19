import conexion from '../../config/conexion.json';
import { db, leerAjuste, guardarAjuste, nuevoId } from './db.js';

// Envío de inscripciones a la base central.
// Reglas:
//  · Se envía todo lo que está «pendiente».
//  · Cada inscripción se envía con la llave del acceso (QR) con el que se cargó (Etapa 3).
//  · Si no hay internet (o el servidor no responde), queda «pendiente» y se reintenta después.
//  · Si el servidor la rechaza por un motivo que no se arregla reintentando, queda en «error»
//    con el motivo en palabras simples. Nunca se borra.
//  · El servidor no duplica: si llega dos veces, la guarda una sola vez.
//  · Después del horario se sigue enviando lo pendiente («modo solo envío»).

export const MENSAJES_ERROR = {
  sesion_invalida: 'Este celular ya no tiene un acceso válido para enviar. Las inscripciones siguen guardadas en el celular: NO borres la app. Avisá a un organizador para que revise tu QR.',
  sin_permiso: 'Este QR es de control de presentes y no permite cargar inscripciones. Las inscripciones siguen guardadas en el celular: NO borres la app y avisá a un organizador.',
  datos_invalidos: 'La base central no aceptó esta inscripción. Sigue guardada en el celular: NO borres la app. Mostrale esta pantalla a un organizador.',
};

export const claveTokenSesion = (sesionId) => `token:${sesionId}`;

const TIEMPO_MAXIMO = 20000;

export async function llamarFuncion(nombre, cuerpo, fetchFn = fetch) {
  const r = await fetchFn(`${conexion.url}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: conexion.clavePublica },
    body: JSON.stringify(cuerpo),
    // Con señal muy débil un envío puede quedar colgado: a los 20 segundos se corta y se reintenta después.
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(TIEMPO_MAXIMO) } : {}),
  });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.http = r.status;
    throw e;
  }
  return r.json();
}

// Si la app se cerró en medio de un envío, esas inscripciones vuelven a «pendiente».
export async function recuperarEnvioInterrumpido() {
  await db.inscripciones.where('estado').equals('enviando').modify({ estado: 'pendiente' });
}

// Identificador de este celular (se crea una vez). Sirve para saber desde qué dispositivo se cargó.
export async function idDispositivo() {
  let id = await leerAjuste('dispositivo');
  if (!id) {
    id = nuevoId();
    await guardarAjuste('dispositivo', id);
  }
  return id;
}

let enCurso = null;

// Envía todas las inscripciones pendientes. Devuelve un resumen.
export function sincronizar(fetchFn = fetch) {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const resultado = { enviadas: 0, errores: 0, sinConexion: false };
    try {
      const dispositivo = await idDispositivo();
      const lista = await db.inscripciones.where('estado').equals('pendiente').sortBy('creadaEn');
      for (const ins of lista) {
        const token = ins.sesionId ? await leerAjuste(claveTokenSesion(ins.sesionId)) : null;
        if (!token) {
          await db.inscripciones.update(ins.id, { estado: 'error', error: 'sesion_invalida' });
          resultado.errores += 1;
          continue;
        }
        await db.inscripciones.update(ins.id, { estado: 'enviando' });
        let respuesta;
        try {
          const { estado, error, numeroOrden, ...paraEnviar } = ins;
          try {
            respuesta = await llamarFuncion('enviar_inscripcion_y_presente', { p_token: token, p: { ...paraEnviar, dispositivo } }, fetchFn);
          } catch (e) {
            // Base todavía sin la Etapa 4B: se envía sin la marca de presente.
            if (e.http !== 404) throw e;
            const { presente, ...sinPresente } = paraEnviar;
            respuesta = await llamarFuncion('enviar_inscripcion', { p_token: token, p: { ...sinPresente, dispositivo } }, fetchFn);
          }
        } catch {
          // Sin internet o servidor caído: queda pendiente y se corta la vuelta.
          await db.inscripciones.update(ins.id, { estado: 'pendiente' });
          resultado.sinConexion = true;
          break;
        }
        if (respuesta && respuesta.ok) {
          await db.inscripciones.update(ins.id, {
            estado: 'sincronizado',
            numeroOrden: respuesta.numeroOrden,
            enviadaEn: new Date().toISOString(),
            error: null,
          });
          resultado.enviadas += 1;
        } else {
          await db.inscripciones.update(ins.id, {
            estado: 'error',
            error: (respuesta && respuesta.error) || 'datos_invalidos',
          });
          resultado.errores += 1;
        }
      }
      if (!resultado.sinConexion) await guardarAjuste('ultimaSincronizacion', new Date().toISOString());
    } finally {
      enCurso = null;
    }
    return resultado;
  })();
  return enCurso;
}
