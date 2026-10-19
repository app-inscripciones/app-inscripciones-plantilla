// Etapa 9 (R17): ayuda dentro de la app. Un tema por pantalla: qué es, qué se puede hacer
// y qué hacer si algo no anda. Lenguaje simple, frases cortas.
// `rol` indica qué manual y qué video corresponden (ver enlaces.json).

export const TEMAS = {
  // ---------------------------------------------------------------- panel
  resumen: {
    titulo: 'Resumen del evento',
    rol: 'organizador',
    puntos: [
      'Muestra cuántas inscripciones llegaron, cuánto dinero se cobró y cuánto efectivo falta rendir. Se actualiza solo cada minuto.',
      '«Efectivo pendiente de rendir» es lo que los cargadores cobraron en efectivo y todavía no entregaron al Tesorero.',
      'Solo se ve lo que ya llegó a la base. Si un celular estuvo sin internet, mirá su «última conexión» en la tabla de efectivo por cargador.',
      'Arriba, el Organizador puede cerrar o volver a abrir las inscripciones. La puerta sigue funcionando igual.',
      'En «Presentes» se ve cuántos llegaron en cada momento de asistencia y quiénes faltan.',
      'En los eventos por pareja o por grupo, el panel cuenta inscripciones y también personas: el cupo y los presentes se cuentan por personas.',
      'Si el evento tiene autopresente con QR, al lado de los presentes dice cuántos «se anotaron solos».',
      'En los eventos híbridos, «Presencial y virtual» muestra cuántos van al lugar contra el cupo. Avisa al 90 % y, si así se configuró, cierra solos los lugares presenciales (se pueden volver a abrir o ampliar el cupo).',
      'Abajo de todo, el Organizador tiene «Borrar o archivar este evento…». Se puede BORRAR solo un evento sin datos (por ejemplo, uno creado por error).',
      'Un evento con inscripciones se ARCHIVA: deja de verse en el panel y en los QR, pero no se borra nada. Antes hay que rendir todo el efectivo y los tickets.',
      'Para ver un evento archivado, tildá «Ver archivados» al lado de la lista de eventos. Ahí está «Volver a mostrar».',
    ],
  },
  inscripciones: {
    titulo: 'Inscripciones',
    rol: 'organizador',
    puntos: [
      'Buscá por nombre, DNI, teléfono o número de orden. Tocá una inscripción para ver todos sus datos y su historial.',
      '«Para revisar» junta las que necesitan que alguien las mire: posible duplicado, cargada fuera de horario o monto distinto al precio.',
      'Si está bien, tocá «✓ Revisada». Si está mal, anulala y que la carguen de nuevo.',
      'El Organizador puede corregir datos y el medio de pago. El monto no se cambia: si el error es de precio o categoría, se anula y se carga otra vez.',
      'En los grupos (equipos, familias) se pueden cambiar los datos de cualquier integrante. Agregar o quitar integrantes se puede solo si el monto no cambia (cuando se cobra un precio por grupo); si cambia, se anula y se carga de nuevo.',
      'Todo cambio pide un motivo y queda registrado.',
    ],
  },
  rendiciones: {
    titulo: 'Rendiciones de efectivo',
    rol: 'tesorero',
    puntos: [
      'Cuando un cargador te entrega efectivo, tocá «Registrar entrega» en su fila y escribí cuánto te dio.',
      'Antes de recibir, pedile que conecte el celular a internet y espere a que todo esté en 🟢: así el panel tiene todas sus inscripciones.',
      'Si registraste mal una entrega, anulala con un motivo y registrala de nuevo.',
      'Un «falta rendir» negativo quiere decir que se rindió de más.',
    ],
  },
  eventos: {
    titulo: 'Crear eventos',
    rol: 'organizador',
    puntos: [
      'El asistente hace preguntas simples, de a una. Se guarda solo en cada paso: podés seguir otro día desde «Borradores».',
      'Para no empezar de cero, usá «Copiar otro evento» (por ejemplo, el del año pasado).',
      'En «¿Cómo se inscriben?» elegís por persona, en pareja o en grupo. En los grupos ponés cómo se llaman (equipo, familia…), cuántos integrantes y si se cobra un precio por grupo o según cada integrante.',
      'En «¿Qué datos se piden?» cada pregunta viene obligatoria; destildá «Obligatoria» para que quien carga pueda dejarla en blanco.',
      'Antes de abrir, probá el formulario en la vista previa: después de abrir el evento, el formulario y los precios ya no se pueden cambiar.',
      'Para capacitar a los voluntarios, tocá «Crear evento de práctica»: funciona igual que uno real, no se mezcla con los demás y se borra solo al terminar la semana.',
      'Antes del primer evento real, hacé tu práctica de Organizador. El recuadro «Tu práctica», arriba del panel, te dice paso a paso qué hacer.',
      'No puede haber dos eventos con el mismo nombre: si se repite, agregale el año, el lugar o el grupo. En las listas, cada evento aparece con su fecha.',
    ],
  },
  qr: {
    titulo: 'QR de colaboradores',
    rol: 'organizador',
    puntos: [
      'Cada QR sirve para una persona, un celular, un evento, una tarea (cargar o puerta) y un horario.',
      'Imprimilo o mandalo por WhatsApp. El código se muestra una sola vez: si se pierde, creá otro.',
      'La persona escanea el QR, instala la app y la abre desde el ícono para activarla. Hace falta internet solo esa vez.',
      'Para cortar un acceso antes de tiempo, tocá «Cerrar este QR». Lo que ya cargó y no envió llega igual.',
      'Si el evento tiene autopresente, abajo aparece «+ QR de autopresente»: un cartel para imprimir (vale en el horario que elijas) o una pantalla con un QR que cambia cada 30 segundos (más seguro).',
    ],
  },
  personas: {
    titulo: 'Personas y roles',
    rol: 'responsable',
    puntos: [
      'Agregá a cada persona con su correo: entra al panel con un código que le llega a ese correo.',
      'Una persona puede tener varios roles. En un evento chico, una sola persona puede tenerlos todos.',
      'Para quitarle el acceso a alguien, desactivala: no se borra nada de lo que hizo.',
      'Siempre tiene que quedar al menos un Responsable general.',
    ],
  },
  institucion: {
    titulo: 'Datos de la institución',
    rol: 'responsable',
    puntos: [
      'El nombre, los colores y el logo aparecen en todas las pantallas, también en los celulares.',
      'Los celulares toman los cambios la próxima vez que abren la app con internet.',
      'El aviso sobre datos de salud se muestra en el formulario cuando el evento pide esos datos.',
    ],
  },

  estado: {
    titulo: 'Estado del sistema',
    rol: 'responsable',
    puntos: [
      'Todos los días, a la mañana, el sistema se revisa solo: que se haya hecho el respaldo, que las bases estén activas, que las llaves sirvan, que el correo funcione y que quede espacio.',
      'Si algo necesita atención, llega un correo a los Responsables generales y aparece acá, con qué hacer.',
      '🔴 es un problema para resolver pronto. 🟡 es un aviso: conviene mirarlo, pero el sistema sigue andando.',
      'Si un caso no se entiende, buscalo en la guía «¿Qué hago si…?».',
    ],
  },

  // ---------------------------------------------------------------- celular
  cargador: {
    titulo: 'Cómo cargar inscripciones',
    rol: 'cargador',
    puntos: [
      'Tocá «+ Nueva inscripción», completá los datos y revisá la pantalla de confirmación antes de guardar.',
      'Si el evento es por grupo (equipos, familias), cargá los datos del grupo y después los de cada integrante. Con «+ Agregar integrante» sumás más; marcá quién es el responsable.',
      'El monto lo calcula la app: cobrá exactamente lo que dice.',
      'Funciona sin internet. Cada inscripción se guarda en el celular (🟡) y se envía sola cuando vuelve la señal (🟢).',
      'Nunca borres ni desinstales la app con inscripciones sin enviar: se perderían.',
      'Antes de entregar el efectivo, conectate a internet, esperá a que todo esté en 🟢 y mirá el «Resumen para rendir».',
      'Si arriba dice 🧪 PRÁCTICA, nada es real: cobrá de mentira y no entregues dinero.',
      'Para dejar de cargar en este celular (o pasar a otro evento), abajo de todo está «Dejar este acceso…». Lo que falta enviar no se pierde. Si escaneás otro QR, la app te pregunta si querés cambiar.',
    ],
  },
  puerta: {
    titulo: 'Cómo tomar presentes',
    rol: 'presentes',
    puntos: [
      'Pedile a la persona su nombre o su DNI y escribí 2 o 3 letras o números: la lista se achica sola.',
      'Tocá «✓ Presente». Si te equivocaste, tocá «Deshacer» enseguida.',
      'Si aparece en verde, ya la marcó alguien (se ve a qué hora y quién).',
      'Si no aparece, mandala con un cargador para que la inscriba.',
      'En los grupos se busca por el nombre del grupo o de cualquier integrante. Si se marca a cada integrante por separado, hay un botón por persona.',
      '«Se anotó solo» quiere decir que la persona marcó su presente con el QR de la entrada: no hace falta marcarla de nuevo.',
      'Funciona sin internet. Las marcas se comparten con los otros celulares cuando hay señal.',
      'Para dejar la puerta en este celular, abajo de todo está «Dejar este acceso…». Antes hay que conectarse para que se envíen las marcas.',
    ],
  },
  rendir: {
    titulo: 'Resumen para rendir',
    rol: 'cargador',
    puntos: [
      'Muestra cuánto cobraste en efectivo, con terminal y por transferencia, incluso lo que todavía no se envió.',
      'Al Tesorero se le entrega el efectivo y los tickets en papel de la terminal. Las transferencias no se entregan: ya están en la cuenta.',
      'Antes de rendir, conectate a internet y esperá a que todo esté en 🟢.',
    ],
  },
};
