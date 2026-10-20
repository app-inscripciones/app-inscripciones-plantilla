// Etapa 9 (R17): guía «¿Qué hago si…?». Problemas frecuentes y qué hacer, en palabras simples.
// Es la misma guía que se ve dentro de la app (/#ayuda) y la que se imprime (herramientas/manuales).
// Cada caso: la pregunta tal como la diría la persona, y los pasos para resolverlo.

export const SECCIONES = [
  {
    id: 'celular',
    titulo: 'En el celular (cargadores y puerta)',
    casos: [
      {
        pregunta: 'No hay internet en el lugar',
        pasos: [
          'Seguí cargando o marcando presentes como siempre: la app funciona sin internet.',
          'Lo que cargás queda guardado en el celular (🟡) y se envía solo cuando vuelve la señal (🟢).',
          'No borres ni desinstales la app mientras haya algo en 🟡.',
        ],
      },
      {
        pregunta: 'Una inscripción quedó en 🟡 «sin enviar» hace mucho',
        pasos: [
          'Conectate a internet (Wi-Fi o datos) y tocá «Enviar ahora».',
          'Si sigue igual, cerrá la app del todo y volvé a abrirla desde el ícono.',
          'Si después de eso sigue en 🟡, avisá a un organizador. No borres la app: la inscripción está guardada en el celular.',
        ],
      },
      {
        pregunta: 'Una inscripción aparece en 🔴 «No se pudo enviar»',
        pasos: [
          'Leé el mensaje en rojo: dice qué pasó.',
          'La inscripción sigue guardada en el celular. No borres la app.',
          'Mostrale la pantalla a un organizador. Él puede revisar tu acceso o cargarla de nuevo desde otro QR.',
        ],
      },
      {
        pregunta: 'El QR no se activa',
        pasos: [
          'Para activar hace falta internet (solo esa vez).',
          'Abrí la app desde el ícono instalado, no desde el navegador.',
          'Si la cámara no abre, escribí el código corto que está debajo del QR.',
          'Si dice que ya se activó en otro celular o que venció, pedile un QR nuevo al organizador: cada QR sirve para un solo celular y un horario.',
        ],
      },
      {
        pregunta: 'Se terminó mi horario y todavía tengo inscripciones sin enviar',
        pasos: [
          'Tranquilo: la app pasa a «solo envío» y las sigue guardando.',
          'Conectate a internet y tocá «Enviar ahora» hasta que todo esté en 🟢.',
          'Después mirá el «Resumen para rendir» y entregale al Tesorero el efectivo y los tickets de la terminal.',
        ],
      },
      {
        pregunta: 'Me equivoqué en una inscripción que ya guardé',
        pasos: [
          'No la cargues de nuevo.',
          'Avisale al organizador con el número de orden o el nombre: él la corrige (o la anula y te pide que la cargues bien).',
          'Si el error fue en la categoría o en el precio, se anula y se carga otra vez.',
        ],
      },
      {
        pregunta: 'El monto que calcula la app no me parece bien',
        pasos: [
          'Revisá la categoría elegida y las respuestas (por ejemplo, si usa transporte).',
          'El precio depende de la fecha: hasta la fecha de corte rige el precio anticipado.',
          'Si aun así no coincide con lo que te dijeron, no guardes: consultá al organizador.',
        ],
      },
      {
        pregunta: 'En la puerta, la persona no aparece en la lista',
        pasos: [
          'Probá con otra parte del nombre, con el apellido o con el DNI.',
          'Si tenés internet y la inscripción es de hoy, esperá unos segundos: la lista se actualiza sola.',
          'Si no aparece, mandala con un cargador. El día del evento, el cargador puede tildar «Ya está presente» al guardar.',
        ],
      },
      {
        pregunta: 'En la puerta marqué a la persona equivocada',
        pasos: [
          'Si fue recién, tocá «Deshacer» en el cartel de abajo.',
          'Si ya pasó, avisale al organizador: él quita la marca desde el panel.',
        ],
      },
      {
        pregunta: 'En un grupo (equipo, familia) no me deja guardar',
        pasos: [
          'Leé el mensaje en rojo arriba de «Integrantes»: dice si faltan o sobran personas, o si falta marcar al responsable.',
          'Con «+ Agregar integrante» sumás una persona; con «Quitar» sacás la que sobra.',
          'Tocá «Hacer responsable» en la persona que queda a cargo del grupo (una sola).',
          'Si un DNI aparece repetido dentro del grupo, revisalo: no puede estar dos veces.',
        ],
      },
      {
        pregunta: 'Una persona no puede marcar su presente con el QR de la entrada',
        pasos: [
          'Marcala vos desde el celular de la puerta, como siempre: la puerta funciona aunque haya QR.',
          'Si el mensaje dice que el QR «ya cambió», que vuelva a escanear el de la pantalla (cambia cada 30 segundos).',
          'Si dice que «probó muchas veces» o que no la encuentra, marcala en la puerta. Si no está en la lista, mandala con un cargador.',
          'El QR necesita internet en el celular de la persona. Sin internet, se marca en la puerta.',
        ],
      },
      {
        pregunta: 'Se me perdió o se rompió el celular',
        pasos: [
          'Avisá enseguida al organizador: va a cerrar tu QR para que nadie más lo use.',
          'Lo que ya estaba en 🟢 está a salvo. Lo que estaba en 🟡 no se puede recuperar: el organizador lo ve en «Resumen» (última conexión) y decide cómo seguir.',
          'Para seguir trabajando, pedí un QR nuevo para otro celular.',
        ],
      },
      {
        pregunta: 'Escaneé el QR de otro evento y la app me sigue mostrando el anterior',
        pasos: [
          'Un celular trabaja con un acceso a la vez. Al escanear otro QR, la app pregunta: tocá «Dejar el actual y activar el nuevo».',
          'Si no aparece la pregunta, abajo de la pantalla tocá «Dejar este acceso…» → «Sí, dejar este acceso», y después activá el QR nuevo.',
          'Lo que falta enviar del acceso anterior no se pierde: se envía solo cuando hay internet. En la puerta, primero conectate para que se envíen las marcas.',
        ],
      },
      {
        pregunta: 'Un participante no puede marcar su presente con el QR (autopresente)',
        pasos: [
          '«No te encontramos»: que escriba el DNI o el teléfono con el que se inscribió, solo números. En parejas y grupos sirve el teléfono de contacto.',
          '«Este QR ya cambió»: si es el QR de la pantalla, que lo vuelva a escanear (cambia cada 30 segundos).',
          '«Probaste muchas veces», «ya no está en horario» o sin internet: que pase por la puerta y lo marcan ahí, como siempre.',
          'Si no aparece en la puerta tampoco, no está inscripto: derivalo a un cargador.',
        ],
      },
    ],
  },
  {
    id: 'panel',
    titulo: 'En el panel (computadora)',
    casos: [
      {
        pregunta: 'No me llega el código para entrar',
        pasos: [
          'Mirá en «Spam» y en «Promociones».',
          'Esperá un minuto y tocá «Usar otro correo o pedir otro código».',
          'Si dice «Este correo no está habilitado», pedile al Responsable general que te dé de alta en «Personas y roles» con ese mismo correo.',
          'Si no le llega a nadie, el Responsable general tiene que revisar la contraseña de aplicación del Gmail de la institución (manual de instalación, paso 1) y volver a tocar «Instalar».',
        ],
      },
      {
        pregunta: 'Se llenaron los lugares presenciales (evento híbrido)',
        pasos: [
          'Los celulares de los cargadores ya solo ofrecen «Virtual»: se puede seguir inscribiendo en esa modalidad.',
          'Si consiguieron más lugar, en «Resumen» tocá «Cambiar el cupo» y poné el número nuevo: los lugares presenciales se vuelven a abrir solos.',
          'Si un celular sin internet inscribió a alguien presencial después del cierre, llega igual, marcado «sobre el cupo» en «Para revisar»: decidí si entra o pedile que cambie a virtual.',
        ],
      },
      {
        pregunta: 'Quiero capacitar a los voluntarios antes del evento',
        pasos: [
          'En «Crear eventos», tocá «Crear evento de práctica». Se crea y se abre solo.',
          'Creá un QR para cada voluntario (de cargador o de puerta): en la tarjeta impresa dice «PRÁCTICA».',
          'Que activen el QR y practiquen todo: cargar con y sin internet, cobrar (de mentira), rendir y marcar presentes.',
          'No hace falta borrar nada: la práctica se borra sola, con todo lo cargado, al terminar la semana.',
        ],
      },
      {
        pregunta: 'No veo una sección (por ejemplo, «Crear eventos»)',
        pasos: [
          'Cada persona ve solo las secciones de sus roles.',
          'Pedile al Responsable general que te agregue el rol que corresponde. Después tocá «Salir» y volvé a entrar.',
        ],
      },
      {
        pregunta: 'El panel muestra menos inscripciones que las que se cargaron',
        pasos: [
          'El panel muestra solo lo que ya llegó a la base.',
          'En «Resumen», mirá la «última conexión» de cada cargador: si es vieja, ese celular tiene inscripciones sin enviar.',
          'Pedile a ese cargador que se conecte a internet y toque «Enviar ahora».',
        ],
      },
      {
        pregunta: 'Hay inscripciones «Para revisar»',
        pasos: [
          '«Posible duplicado»: otra inscripción tiene el mismo DNI o teléfono. Si son la misma persona, anulá una; si no, marcá «Revisada».',
          '«Fuera de horario»: se cargó después del horario del QR o con las inscripciones cerradas. Si está bien, «Revisada».',
          '«Monto distinto al precio»: lo cobrado no coincide con el precio. Confirmá con el cargador; si estuvo mal, anulala y que la carguen de nuevo.',
        ],
      },
      {
        pregunta: 'El efectivo que entregó un cargador no coincide con el panel',
        pasos: [
          'Primero, que el cargador se conecte a internet y espere a que todo esté en 🟢.',
          'Comparen su «Resumen para rendir» con su fila en «Rendiciones».',
          'Registrá lo que realmente entregó. Si falta o sobra, anotalo en la observación.',
        ],
      },
      {
        pregunta: 'Abrí un evento con un error en el formulario o en los precios',
        pasos: [
          'Un evento abierto ya no se puede cambiar (así nadie cambia las reglas a mitad de camino).',
          'Si todavía no hay inscripciones: cerrá las inscripciones, creá el evento de nuevo con «Copiar otro evento», corregilo y abrilo.',
          'Si ya hay inscripciones: consultá con el Responsable general antes de hacer nada.',
          'Los momentos de asistencia sí se pueden agregar con el evento abierto («Resumen» → «Editar momentos de asistencia»).',
        ],
      },
      {
        pregunta: 'Aparece «La base de datos está desactualizada»',
        pasos: [
          'Hay una versión nueva de la app y falta actualizar la base.',
          'El Responsable general entra a GitHub → pestaña «Actions» → «Actualizar» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo).',
          'Cuando termine en verde ✅, actualizá la página del panel (tecla F5).',
        ],
      },
      {
        pregunta: 'Quiero agregar o quitar a alguien de un grupo ya inscripto',
        pasos: [
          'En «Inscripciones», tocá el grupo → «Corregir datos o medio de pago».',
          'Podés cambiar los datos de cualquier integrante (por ejemplo, reemplazar a uno por otro). Escribí el motivo y guardá.',
          'Agregar o quitar personas se puede solo si el monto no cambia (cuando se cobra un precio por grupo) y respetando el mínimo y el máximo.',
          'Si el panel dice que «correspondería cobrar otro monto», anulá la inscripción con el motivo y cargala de nuevo con un QR de cargador.',
        ],
      },
      {
        pregunta: 'Creé un evento de más (o con el nombre equivocado) y lo quiero borrar',
        pasos: [
          'En «Resumen», elegí ese evento y bajá hasta «Borrar o archivar este evento…».',
          'Si no tiene inscripciones, presentes ni rendiciones, se puede borrar: escribí su nombre para confirmar y tocá «Sí, borrar el evento». No se puede deshacer.',
          'Si ya tiene datos, no se puede borrar: se archiva (no se pierde nada y se puede volver a mostrar). Antes, el Tesorero tiene que registrar todo lo que falta rendir.',
        ],
      },
      {
        pregunta: 'La app me dice que todavía no hice la práctica',
        pasos: [
          'Es un aviso para evitar errores en un evento real: no impide seguir («Seguir igual»).',
          'Arriba del panel, el recuadro «Tu práctica» dice en qué paso estás y tiene un botón que lleva a la pantalla justa. Seguilo: se actualiza solo.',
          'El Tesorero practica registrando una entrega en el evento de práctica.',
        ],
      },
      {
        pregunta: 'Creé un QR y cerré la pantalla sin activarlo en el celular',
        pasos: [
          'El código del QR se muestra una sola vez, por seguridad: no se puede volver a ver.',
          'Creá otro: en la práctica, el recuadro «Tu práctica» tiene el botón «Crear otro QR» (el anterior se cierra solo).',
          'En un evento real: «QR de colaboradores» → «Cerrar este QR» en el que no se usó y después «+ QR de cargador».',
        ],
      },
      {
        pregunta: 'El QR de autopresente (cartel o pantalla) no aparece',
        pasos: [
          'Solo aparece en los eventos que lo tienen activado: se elige al crear el evento, en «¿Cómo se va a tomar asistencia?».',
          'Entrá a «QR de colaboradores», elegí el evento y bajá hasta «📱 Autopresente con QR» → «+ QR de autopresente».',
          'Para la pantalla que cambia hace falta un aparato con internet en la entrada. Si no hay, usá el cartel impreso.',
        ],
      },
      {
        pregunta: 'Aparece «Algo no salió bien (código: …)»',
        pasos: [
          'Actualizá la página (tecla F5) y probá de nuevo.',
          'Si vuelve a pasar, anotá el código y qué estabas haciendo, y avisá al Responsable general. Mientras tanto, se puede seguir con otras tareas: los datos no se pierden.',
        ],
      },
    ],
  },
  {
    id: 'mantenimiento',
    titulo: 'Mantenimiento (Responsable general)',
    casos: [
      {
        pregunta: 'Llegó un correo de GitHub diciendo que falló el «Respaldo diario»',
        pasos: [
          'Entrá a GitHub → pestaña «Actions» → «Respaldo diario» y abrí la ejecución en rojo ❌.',
          'Si el mensaje habla de la llave de Supabase («401» o «token»), creá una llave nueva y cargala de nuevo (manual de instalación, pasos 4 y 6).',
          'Si dice que la base está pausada, mirá el caso siguiente.',
          'Después tocá «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo) en «Respaldo diario»: tiene que terminar en verde ✅.',
        ],
      },
      {
        pregunta: 'La base de datos está «dormida» o «pausada» (el panel no conecta)',
        pasos: [
          'No hagas nada: el sistema la despierta solo, dos veces por día (a las 6 y a las 18). No se pierde nada, y los celulares de los cargadores siguen cargando y envían todo después.',
          'Si hay apuro (por ejemplo, el día del evento): en GitHub, pestaña «Actions» → a la izquierda «Despertar la base» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo). Esperá a que termine en verde ✅ (unos 5 a 10 minutos) y actualizá el panel (tecla F5).',
          'Si termina en rojo ❌ y el mensaje habla de la «llave de Supabase»: creá una llave nueva (manual de instalación, paso 4) y cargala en GitHub con el mismo nombre, SUPABASE_ACCESS_TOKEN. Después volvé a tocar «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo).',
          'Si termina en rojo por otro motivo: entrá a supabase.com, abrí el proyecto y tocá «Resume project» (el botón blanco; nunca «Upgrade to Pro», que es pago).',
        ],
      },
      {
        pregunta: 'Llegó un correo: «La base … estaba pausada y se despertó sola»',
        pasos: [
          'No hay que hacer nada: el sistema ya la volvió a poner en marcha y no se perdió nada.',
          'Si querés confirmarlo: en el panel, «Estado del sistema» tiene que decir que las bases están activas.',
        ],
      },
      {
        pregunta: 'Llegó un correo «Sistema de inscripciones: hay algo para revisar»',
        pasos: [
          'Lo manda solo el sistema, todos los días a la mañana, cuando algo necesita atención. No es publicidad ni un engaño: viene del Gmail de la institución.',
          'El correo dice qué pasó y qué hacer. Lo mismo se ve en el panel, en «Estado del sistema».',
          '🔴 es un problema para resolver pronto (por ejemplo, un respaldo que falló). 🟡 es un aviso (por ejemplo, una llave que vence en un mes).',
          'Cuando lo arregles, al día siguiente la revisión lo confirma sola. Para no esperar: GitHub → «Actions» → «Revisión diaria» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo).',
        ],
      },
      {
        pregunta: 'La base de datos se está llenando',
        pasos: [
          'El plan gratuito de Supabase permite 500 MB. El sistema avisa al 80 % y al 95 %.',
          'Cada evento ocupa poco (3.000 inscripciones, unos 11 MB): llenarla lleva muchos eventos.',
          'Antes de hacer nada, descargá el Excel de los eventos viejos y guardalo.',
          'Para liberar espacio o pasar al plan pago (tiene costo), consultá con alguien de confianza que maneje tecnología: borrar datos no tiene vuelta atrás.',
        ],
      },
      {
        pregunta: 'Se perdió la clave de respaldo o una contraseña',
        pasos: [
          'Buscala en la hoja de accesos impresa.',
          'Contraseñas de Gmail, GitHub y Cloudflare: se recuperan con «¿Olvidaste la contraseña?» usando el Gmail de la institución y los códigos de recuperación.',
          'Clave de respaldo: inventá una nueva, cargala en GitHub con el mismo nombre (CLAVE_RESPALDO) y tocá «Instalar» otra vez. Los respaldos viejos quedan sin poder abrirse.',
        ],
      },
      {
        pregunta: 'Se va el Responsable general',
        pasos: [
          'Antes de irse, que dé el rol Responsable general a otra persona en «Personas y roles».',
          'Que le entregue la hoja de accesos y el acceso al Gmail de la institución (todas las cuentas dependen de ese correo).',
          'La persona nueva cambia las contraseñas y actualiza la hoja.',
        ],
      },
      {
        pregunta: 'Quiero actualizar la app a una versión nueva',
        pasos: [
          'GitHub → pestaña «Actions» → «Actualizar» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo). Tarda unos 5 minutos y no se pierden datos.',
          'Si al final aparece un aviso sobre «.github», no hace falta hacer nada: la app funciona igual.',
        ],
      },
    ],
  },
];

// Versión en texto (Markdown), para el documento del proyecto y para imprimir.
export function comoMarkdown() {
  const partes = ['# ¿Qué hago si…?', '', 'Problemas frecuentes y qué hacer, en palabras simples. La misma guía está dentro de la app (botón «¿Qué hago si…?»).', ''];
  for (const s of SECCIONES) {
    partes.push(`## ${s.titulo}`, '');
    for (const c of s.casos) {
      partes.push(`### ${c.pregunta}`, '');
      c.pasos.forEach((p, i) => partes.push(`${i + 1}. ${p}`));
      partes.push('');
    }
  }
  return partes.join('\n');
}
