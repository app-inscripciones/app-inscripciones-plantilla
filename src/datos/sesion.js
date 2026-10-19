import { db, leerAjuste, guardarAjuste } from './db.js';
import { llamarFuncion, idDispositivo, claveTokenSesion } from './sincronizacion.js';

// Acceso temporal del colaborador (Etapa 3).
// El celular activa un QR UNA vez con internet. La base le devuelve una «llave» propia
// y todo lo necesario para trabajar sin conexión (evento, nombre, tarea y horario).

export const MENSAJES_ACTIVACION = {
  codigo_invalido: 'Ese código no existe. Revisá que esté bien escrito o pedile otro QR al organizador.',
  acceso_cerrado: 'Este QR fue cerrado por el organizador. Pedile uno nuevo.',
  acceso_vencido: 'Este QR ya venció (terminó su horario). Pedile uno nuevo al organizador.',
  evento_cerrado: 'El evento de este QR ya no está abierto. Consultá al organizador.',
  inscripciones_cerradas: 'Las inscripciones de este evento están cerradas. Consultá al organizador.',
  ya_activado: 'Este QR ya se activó en otro celular. Cada QR sirve para un solo celular: pedile uno nuevo al organizador.',
  datos_invalidos: 'No se pudo activar. Revisá que tengas internet y probá de nuevo; si sigue, pedile al organizador un QR nuevo.',
  sin_conexion: 'Para activar el QR hace falta internet (una sola vez). Conectate y probá de nuevo.',
};

// Saca el código de lo que se escaneó o escribió: un enlace con ?a=CÓDIGO o el código solo.
export function extraerCodigo(texto) {
  if (!texto) return '';
  let t = String(texto).trim();
  try {
    const u = new URL(t);
    t = u.searchParams.get('a') || '';
  } catch {
    /* no es un enlace: es el código escrito */
  }
  const limpio = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.length !== 8) return limpio;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

// En qué momento está el acceso: antes del horario, dentro, vencido, cerrado por el organizador o con las inscripciones cerradas.
export function estadoAcceso(sesion, ahora = new Date()) {
  if (!sesion) return 'sin_acceso';
  if (sesion.cerradoEn) return 'cerrado';
  // D46: si el organizador cerró las inscripciones, el cargador pasa a «solo envío» (la puerta sigue igual).
  if (sesion.tarea !== 'presentes' && sesion.inscripcionesCerradasEn) return 'inscripciones_cerradas';
  const t = ahora.getTime();
  if (t >= new Date(sesion.hasta).getTime()) return 'vencido';
  if (t < new Date(sesion.desde).getTime()) return 'antes';
  return 'vigente';
}

export const claveToken = claveTokenSesion;

export async function leerSesion() {
  return leerAjuste('sesionActual');
}

export async function activarAcceso(codigoEscrito, fetchFn = fetch) {
  const codigo = extraerCodigo(codigoEscrito);
  if (codigo.length !== 9) return { ok: false, error: 'codigo_invalido' };
  let r;
  try {
    r = await llamarFuncion('activar_acceso', { p_codigo: codigo, p_dispositivo: await idDispositivo() }, fetchFn);
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'datos_invalidos' };

  // Lo ya enviado de accesos anteriores se borra del celular (datos personales);
  // lo pendiente se conserva hasta que se envíe con su propia llave.
  const anterior = await leerSesion();
  if (anterior && anterior.sesionId !== r.sesionId) {
    await db.inscripciones.where('estado').equals('sincronizado').delete();
  }

  const sesion = {
    sesionId: r.sesionId,
    tarea: r.tarea,
    colaborador: r.colaborador,
    desde: r.desde,
    hasta: r.hasta,
    cerradoEn: null,
    evento: r.evento,
    activadaEn: new Date().toISOString(),
  };
  await guardarAjuste(claveToken(r.sesionId), r.token);
  await guardarAjuste('sesionActual', sesion);
  return { ok: true, sesion };
}

// Pregunta a la base si el acceso sigue vigente (para enterarse de un cierre manual).
// Si mientras tanto el colaborador terminó o cambió de acceso, no se pisa lo nuevo.
export async function actualizarEstadoSesion(fetchFn = fetch) {
  const sesion = await leerSesion();
  if (!sesion) return null;
  const token = await leerAjuste(claveToken(sesion.sesionId));
  if (!token) return sesion;
  let r;
  try {
    r = await llamarFuncion('estado_sesion', { p_token: token }, fetchFn);
  } catch {
    return sesion; // sin internet: sigue lo que sabía
  }
  let cambios = null;
  if (r && r.ok) cambios = { desde: r.desde, hasta: r.hasta, cerradoEn: r.cerradoEn, inscripcionesCerradasEn: r.inscripcionesCerradasEn || null, presenciales: r.presenciales || null };
  else if (r && r.error === 'sesion_invalida') cambios = { cerradoEn: sesion.cerradoEn || new Date().toISOString() };
  if (!cambios) return sesion;
  return db.transaction('rw', db.ajustes, async () => {
    const actual = await leerSesion();
    if (!actual || actual.sesionId !== sesion.sesionId) return actual;
    const s = { ...actual, ...cambios };
    await guardarAjuste('sesionActual', s);
    return s;
  });
}

// Cuando el acceso terminó y todo se envió: se borra lo del celular para activar otro QR.
export async function terminarAcceso() {
  const sesion = await leerSesion();
  await db.inscripciones.where('estado').equals('sincronizado').delete();
  if (sesion) await db.ajustes.delete('sesionActual');
}

// D64 · Dejar el acceso actual (para salir o para activar otro QR), sin perder nada:
//  · cargador: lo que falta enviar se conserva y se envía solo con su propia llave; lo ya enviado se borra del celular;
//  · puerta: las marcas pendientes solo se pueden enviar con este acceso, así que primero hay que enviarlas.
export async function dejarAcceso() {
  const sesion = await leerSesion();
  if (!sesion) return { ok: true };
  if (sesion.tarea === 'presentes') {
    const pendientes = await db.marcas.where('envio').equals('pendiente').filter((m) => m.sesionId === sesion.sesionId).count();
    if (pendientes > 0) return { ok: false, error: 'marcas_pendientes', pendientes };
    await db.transaction('rw', db.puerta, db.marcas, db.ajustes, async () => {
      await db.puerta.clear();
      await db.marcas.where('envio').notEqual('pendiente').delete();
      await db.ajustes.bulkDelete(['puertaDesde', 'puertaAsistencia', 'puertaUltimaSinc']);
    });
  }
  await db.inscripciones.where('estado').equals('sincronizado').delete();
  await db.ajustes.delete('sesionActual');
  return { ok: true };
}

// ¿La app está instalada (abierta desde el ícono)?
export function estaInstalada() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}
