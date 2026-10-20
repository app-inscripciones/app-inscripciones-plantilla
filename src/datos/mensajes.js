// Etapa 9 (R17): todos los mensajes de error del panel en un solo lugar.
// Regla: cada mensaje dice QUÉ PASÓ y QUÉ HACER, en palabras simples.
// Si llega un código que no está en la lista, se muestra un mensaje general con el código,
// en lugar de decir (mal) que no hay internet.

export const MENSAJES_PANEL = {
  // Conexión y sesión
  sin_conexion: 'No se pudo conectar con la base de datos. Revisá que esta computadora tenga internet y probá de nuevo en un minuto. Si tenés internet y sigue pasando, puede ser que la base esté «dormida» (pasa con el plan gratuito): se despierta sola en unas horas, o el Responsable general toca en GitHub «Actions» → «Despertar la base» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo). No se pierde nada.',
  base_pausada: 'La base de datos está «dormida» (el plan gratuito la pausa si no se usa). Se despierta sola en unas horas. Para no esperar, el Responsable general toca en GitHub «Actions» → «Despertar la base» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo) (tarda unos minutos). No se pierde nada.',
  sesion_vencida: 'Tu sesión se cerró por seguridad. Volvé a entrar con tu correo: te llega un código nuevo.',
  base_desactualizada: 'La base de datos está desactualizada respecto de la aplicación. El Responsable general tiene que tocar «Actualizar» en GitHub (ver «Actualizaciones» en el manual de instalación).',
  error_base: 'La base de datos no pudo hacer lo que pediste. Actualizá la página (tecla F5) y probá de nuevo. Si vuelve a pasar, anotá lo que estabas haciendo y mirá la guía «¿Qué hago si…?».',

  // Ingreso
  no_habilitado: 'Este correo no está habilitado para el panel. Pedile al Responsable general que te dé de alta en «Personas y roles», con este mismo correo.',
  correo_invalido: 'Revisá el correo: parece mal escrito (tiene que ser como nombre@gmail.com).',
  codigo_invalido: 'El código no es correcto o ya venció. Revisá los 6 números o tocá «Usar otro correo o pedir otro código» para recibir uno nuevo.',
  correo_no_sale: 'No se pudo mandar el correo con el código. Probá de nuevo en unos minutos. Si sigue pasando, el Responsable general tiene que revisar la contraseña de aplicación del Gmail (guía «¿Qué hago si…?», «No llega el código»).',
  espera: 'Ya se pidió un código hace muy poco. Esperá un minuto y probá de nuevo (revisá también «Spam» o «Promociones»).',

  // Permisos y personas
  sin_permiso: 'Tu usuario no tiene permiso para esto. Si lo necesitás, pedile al Responsable general que te agregue el rol que corresponde.',
  ultimo_responsable: 'Tiene que quedar al menos un Responsable general activo. Primero dale ese rol a otra persona y después quitáselo a esta.',
  nombre_invalido: 'Escribí el nombre y apellido de la persona.',
  datos_invalidos: 'Faltan datos o hay algo mal escrito. Revisá los campos marcados y probá de nuevo.',

  // Eventos
  evento_inexistente: 'No se encontró ese evento (puede que lo haya borrado otra persona). Actualizá la página (F5).',
  evento_cerrado: 'Ese evento no está abierto. Si es un borrador, terminalo en «Crear eventos» y abrilo.',
  evento_ya_abierto: 'Este evento ya está abierto: su formulario no se puede cambiar. Sí se pueden agregar momentos de asistencia desde «Resumen».',
  definicion_invalida: 'Falta completar algo. Revisá los pasos marcados.',
  no_es_hibrido: 'Este evento no es híbrido: no tiene lugares presenciales y virtuales para controlar. La modalidad se elige al crear el evento.',
  demasiadas_practicas: 'Ya hay 5 eventos de práctica. Usá uno de los que ya están (en «Crear eventos», abajo, se ve hasta cuándo dura cada uno) o esperá a que se borren solos.',
  evento_archivado: 'Ese evento está archivado: no se le pueden crear QR. Para usarlo de nuevo: «Resumen» → tildá «Ver archivados», elegilo y tocá «Volver a mostrar».',
  confirmacion_incorrecta: 'El nombre que escribiste no coincide con el del evento. Escribilo igual (no importan las mayúsculas ni los acentos).',
  evento_con_datos: 'Ese evento ya tiene inscripciones, presentes o rendiciones, así que no se puede borrar (se perderían datos). Lo que sí podés hacer es archivarlo.',
  pendiente_rendir: 'Todavía falta rendir efectivo o tickets de la terminal en este evento. Primero el Tesorero registra esas entregas en «Rendiciones»; después se puede archivar.',
  no_archivado: 'Ese evento ya está a la vista (no estaba archivado).',
  evento_archivado: 'Ese evento está archivado: no se le pueden crear QR. Para usarlo de nuevo: «Resumen» → tildá «Ver archivados», elegilo y tocá «Volver a mostrar».',
  confirmacion_incorrecta: 'El nombre que escribiste no coincide con el del evento. Escribilo igual (no importan las mayúsculas ni los acentos).',
  evento_con_datos: 'Ese evento ya tiene inscripciones, presentes o rendiciones, así que no se puede borrar (se perderían datos). Lo que sí podés hacer es archivarlo.',
  pendiente_rendir: 'Todavía falta rendir efectivo o tickets de la terminal en este evento. Primero el Tesorero registra esas entregas en «Rendiciones»; después se puede archivar.',
  no_archivado: 'Ese evento ya está a la vista (no estaba archivado).',
  inscripciones_cerradas: 'Las inscripciones de este evento están cerradas: no se pueden crear QR de cargador. Sí se pueden crear QR de control de presentes. Para volver a abrirlas: «Resumen» → «Volver a abrir las inscripciones».',
  // D77: QR con varios eventos.
  varios_solo_carga: 'Varios eventos en un mismo QR se pueden elegir solo para cargadores. Para el control de presentes, hacé un QR por evento.',
  mezcla_practica: 'No se puede mezclar un evento de práctica con eventos reales en el mismo QR. Hacé un QR para la práctica y otro para los eventos reales.',
  horario_invalido: 'Revisá el horario: el final tiene que ser después del comienzo, todavía no tiene que haber pasado y no puede durar más de 7 días.',
  instancia_con_marcas: 'Ese momento ya tiene presentes marcados: no se puede cambiar ni borrar. Sí se pueden agregar otros.',

  // Inscripciones y dinero
  monto_invalido: 'Escribí cuánto efectivo entregó o cuántos tickets de terminal (al menos uno de los dos), solo con números, sin puntos ni signo $.',
  falta_motivo: 'Escribí el motivo (al menos unas palabras): queda registrado en el historial.',
  transferencia_incompleta: 'Para transferencia hacen falta el banco o billetera y los últimos 6 caracteres de la operación (letras o números).',
  anulada: 'Esta inscripción ya está anulada. Actualizá la página (F5) para ver su estado.',
  no_encontrada: 'No se encontró: puede que otra persona la haya cambiado. Actualizá la página (F5).',
  acceso_inexistente: 'No se encontró ese QR. Actualizá la página (F5).',
  clave_invalida: 'La clave de organizador no es correcta.',
  integrantes_fuera_de_rango: 'Con ese cambio el grupo queda con menos integrantes que el mínimo o más que el máximo del evento. Revisá la lista de integrantes.',
  falta_responsable: 'Marcá quién es el responsable del grupo (uno solo).',
  autopresente_no_habilitado: 'Este evento no tiene activado el autopresente con QR. Se elige al crear el evento, en el paso «¿Cómo se va a tomar asistencia?».',
  cambia_el_monto: 'Con ese cambio correspondería cobrar otro monto, y el monto no se puede corregir. Si hace falta, anulá esta inscripción (con el motivo) y cargala de nuevo con un QR de cargador.',
};

// D62: mensajes de la página del participante (autopresente con QR). Le hablan a quien llega al evento.
export const MENSAJES_AUTOPRESENTE = {
  qr_invalido: 'Este QR no es válido. Escaneá el QR de la entrada del evento.',
  qr_cerrado: 'Este QR ya se cerró. Acercate a la puerta para que te marquen el presente.',
  qr_vencido: 'Este QR ya no está en horario. Acercate a la puerta para que te marquen el presente.',
  qr_todavia_no: 'Este QR todavía no está habilitado. Probá un poco más tarde o acercate a la puerta.',
  qr_viejo: 'Este QR ya cambió (cambia cada 30 segundos). Volvé a escanear el QR de la pantalla.',
  no_encontrado: 'No te encontramos con ese número. Revisá que esté bien escrito (DNI o teléfono, solo números). Si sigue sin aparecer, acercate a la puerta.',
  dato_corto: 'Escribí tu DNI o tu teléfono completo (solo números).',
  demasiados_intentos: 'Probaste muchas veces. Por seguridad, acercate a la puerta para que te marquen el presente.',
  sin_conexion: 'Hace falta internet para marcar el presente con el QR. Si no tenés, acercate a la puerta.',
  datos_invalidos: 'Algo no salió bien. Volvé a escanear el QR o acercate a la puerta.',
};

// Devuelve el texto para mostrar a partir de la respuesta de una función ({ ok:false, error, detalle }).
// `propios` permite que una pantalla diga algo más preciso para algún código.
export function mensajeError(r, propios = {}) {
  const codigo = r && r.error ? r.error : 'sin_conexion';
  const texto = propios[codigo] || MENSAJES_PANEL[codigo];
  if (texto) return texto;
  return `Algo no salió bien (código: ${codigo}). Actualizá la página (tecla F5) y probá de nuevo. Si vuelve a pasar, anotá ese código y mirá la guía «¿Qué hago si…?».`;
}

// Traduce un error de Supabase (supabase-js) a un código de la lista.
//  · Sin respuesta (internet cortado, servidor caído): sin_conexion.
//  · PGRST301 / JWT vencido: sesion_vencida.
//  · PGRST202: la función no existe en la base (falta ejecutar una actualización).
//  · Cualquier otro: la base respondió con un error (no es un problema de internet).
export function codigoDeErrorSupabase(error) {
  if (!error) return null;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  if (code === 'PGRST301' || /jwt.*expired/i.test(msg)) return 'sesion_vencida';
  if (code === 'PGRST202' || code === '42883') return 'base_desactualizada';
  if (String(error.status) === '540' || /project.*paused|paused project/i.test(msg)) return 'base_pausada';
  if (!code || /failed to fetch|network|load failed|fetch/i.test(msg)) return 'sin_conexion';
  return 'error_base';
}

// Asistente: la base explica por qué no deja abrir un evento («detalle»). Se traduce a palabras
// simples y al paso del asistente donde se arregla.
const PROBLEMAS_DEFINICION = [
  [/^nombre$/, 'el nombre del evento tiene que tener entre 3 y 120 letras', 'nombre'],
  [/fecha ya pas/, 'la fecha del evento ya pasó', 'fechas'],
  [/otro evento con ese nombre/, 'ya hay otro evento con ese nombre: cambialo (por ejemplo, agregale el año o el lugar)', 'nombre'],
  [/^fecha$/, 'falta la fecha del evento', 'fechas'],
  // Grupos (D61)
  [/pregunta por integrante fuera de un grupo|nombre del grupo fuera de un grupo|nombres de pareja en un grupo/, 'hay preguntas que no corresponden a cómo se inscriben (persona, pareja o grupo)', 'datos'],
  [/datos del grupo|tipo de grupo|integrantes del grupo/, 'falta el nombre del grupo (por ejemplo, «equipo») o la cantidad de integrantes (mínimo 2, máximo 50, y el mínimo no más que el máximo)', 'unidad'],
  [/forma de cobro del grupo/, 'falta elegir si se cobra un precio por grupo o según cada integrante', 'unidad'],
  [/falta el nombre del grupo|nombre de cada integrante/, 'falta la pregunta del nombre del grupo o la del nombre de cada integrante', 'datos'],
  [/cobro por grupo/, 'con «un precio por grupo», el precio no puede depender de la categoría ni de las respuestas de cada integrante', 'cobro'],
  [/^unidad$/, 'falta elegir si se inscriben por persona, en pareja o en grupo', 'unidad'],
  [/asistencia en evento virtual/, 'un evento solo virtual no toma asistencia en la puerta', 'asistencia'],
  [/modalidad/, 'falta elegir si el evento es presencial, virtual o híbrido (o la pregunta «¿Cómo va a participar?» no está bien)', 'modalidad'],
  [/cupo/, 'el cupo presencial tiene que ser un número entero, y el cierre automático 90, 95 o 100 %', 'modalidad'],
  [/superpuest/, 'las edades de dos categorías se pisan', 'categorias'],
  [/una sola categor/, 'hay una sola categoría (tiene que haber ninguna o al menos dos)', 'categorias'],
  [/categor/, 'hay una categoría sin nombre o con edades mal escritas', 'categorias'],
  [/falta el nombre|faltan los nombres/, 'falta la pregunta del nombre', 'datos'],
  [/^campo|campos|tipo de campo|opciones/, 'hay una pregunta sin texto o una lista con menos de dos opciones', 'datos'],
  [/sin cobro con conceptos/, 'el evento está marcado «Es gratis» pero tiene cobros cargados', 'cobro'],
  [/concepto|precio/, 'hay un cobro sin nombre o con un precio mal escrito (solo pesos enteros)', 'cobro'],
  [/asistencia/, 'hay un momento de asistencia sin nombre o sin fecha', 'asistencia'],
];

export function problemaDefinicion(detalle) {
  const d = String(detalle || '').toLowerCase();
  for (const [patron, texto, paso] of PROBLEMAS_DEFINICION) if (patron.test(d)) return { texto, paso };
  return null;
}
