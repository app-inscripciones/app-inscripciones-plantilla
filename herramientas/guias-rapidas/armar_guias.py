"""Etapa 9 (R17), punto 6: guías rápidas de UNA hoja por rol, para imprimir y tener a mano el día del evento.

Uso:  python3 armar_guias.py            → arma guias/*.html y guias/*.pdf
El script falla si alguna guía ocupa más de una hoja A4 (así nunca se entrega una de dos hojas).
Los textos de los botones son los de la app: si cambia una pantalla, se actualiza acá.
Genéricas: no nombran a ninguna institución; los datos propios se completan a mano en el recuadro «Mis datos».
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

DIR = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(DIR, 'guias')
VERSION = 'Versión del 13/10/2026 · borrador'

CSS = """
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,Arial,sans-serif;color:#1d1d1f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hoja{width:210mm;height:297mm;padding:9mm 11mm 7mm;display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:5mm;background:var(--c);color:#fff;border-radius:5mm;padding:3.5mm 6mm}
header .ic{font-size:12mm;line-height:1}
header h1{margin:0;font-size:8.5mm;line-height:1.05}
header p{margin:1.2mm 0 0;font-size:4.2mm;opacity:.95}
header .dis{margin-left:auto;text-align:right;font-size:3.6mm;font-weight:600;background:rgba(255,255,255,.2);border-radius:3mm;padding:2mm 3mm}
h2{font-size:5mm;margin:3.2mm 0 1.4mm;color:var(--c);display:flex;align-items:center;gap:2mm}
h2 .n{background:var(--c);color:#fff;border-radius:50%;width:7mm;height:7mm;display:inline-flex;align-items:center;justify-content:center;font-size:4.2mm;flex:none}
ol{margin:0;padding-left:6mm;font-size:3.9mm;line-height:1.33}
ol li{margin:0 0 .6mm}
b.btn{display:inline-block;border:.5mm solid var(--c);color:var(--c);border-radius:1.6mm;padding:0 1.1mm;font-weight:700;line-height:1.15}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.estados{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:1mm}
.estados div{border-radius:2.5mm;padding:1.4mm;font-size:3.4mm;text-align:center;background:#f3f4f6;line-height:1.25}
.estados div span{display:block;font-size:5.5mm}
.nunca{background:#fdecec;border-left:2mm solid #c62828;border-radius:2mm;padding:2.5mm 4mm;margin-top:3mm;font-size:3.8mm;line-height:1.3}
.nunca b:first-child{color:#c62828}
.nunca ul{margin:1mm 0 0;padding-left:5mm}
.si{margin-bottom:3mm;margin-top:3mm;border:.4mm solid #d0d4da;border-radius:3mm;padding:2.5mm 4mm}
.si h3{margin:0 0 1.5mm;font-size:4.6mm}
.si table{width:100%;border-collapse:collapse;font-size:3.6mm;line-height:1.25}
.si td{padding:.9mm 1mm;border-top:.25mm solid #e5e7eb;vertical-align:top}
.si td:first-child{font-weight:700;width:38%}
.datos{margin-top:auto !important;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1mm 5mm;border:.5mm dashed var(--c);border-radius:3mm;padding:2mm 4mm;font-size:3.6mm;margin-top:3mm}
.datos .t{grid-column:1/-1;font-weight:700;color:var(--c)}
.datos div{border-bottom:.3mm solid #9aa0a6;padding-top:3mm;white-space:nowrap;overflow:hidden}
.ingreso{margin-top:3mm;background:#f3f4f6;border-radius:2.5mm;padding:2mm 4mm;font-size:3.75mm;line-height:1.35}
pie{display:block;text-align:center;font-size:3mm;color:#888;margin-top:2mm}
.ok{background:#e8f5e9;border-left:2mm solid #2e7d32;border-radius:2mm;padding:2mm 4mm;margin-top:2.5mm;font-size:3.75mm;line-height:1.3}
"""

def b(t): return f'<b class="btn">{t}</b>'

def bloque(n, titulo, items):
    return f'<h2><span class="n">{n}</span>{titulo}</h2><ol>' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>'

def nunca(items):
    return '<div class="nunca"><b>⛔ Nunca:</b><ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul></div>'

def si(filas):
    return ('<div class="si"><h3>🛟 Si pasa algo…</h3><table>' +
            ''.join(f'<tr><td>{a}</td><td>{c}</td></tr>' for a, c in filas) +
            '</table></div>')

def datos(campos):
    return f'<div class="datos" style="grid-template-columns:1fr 1fr"><span class="t">✍️ Mis datos (completar a mano)</span>' + ''.join(f'<div>{c}:</div>' for c in campos) + '</div>'

ESTADOS = ('<div class="estados"><div><span>🟡</span>Guardada en el celular</div><div><span>🔵</span>Enviando</div>'
           '<div><span>🟢</span>Enviada: está a salvo</div><div><span>🔴</span>No se pudo: leé el mensaje</div></div>')

INGRESO = ('<div class="ingreso">🔐 <b>Entrar:</b> dirección de la app terminada en <b>/#panel</b> → tu correo → '
           '<b>Enviarme el código</b> → escribí los <b>6 números</b> que llegan por correo (mirá también Spam). Sin contraseña.</div>')

AYUDA_APP = f'En cada pantalla: {b("¿Cómo se usa esta pantalla?")}. Problemas: la dirección de la app terminada en <b>/#ayuda</b>.'

def hoja(color, icono, titulo, sub, dispositivo, cuerpo):
    import itertools, re
    cont = itertools.count(1)
    cuerpo = re.sub(r'<span class="n">\d+</span>', lambda m: f'<span class="n">{next(cont)}</span>', cuerpo)
    return f"""<div class="hoja" style="--c:{color}">
<header><span class="ic">{icono}</span><div><h1>{titulo}</h1><p>{sub}</p></div><span class="dis">{dispositivo}</span></header>
{cuerpo}
<pie>Guía rápida · {VERSION} · {AYUDA_APP}</pie></div>"""

GUIAS = {
# ------------------------------------------------------------------ CARGADOR
'Guia-rapida-Cargador': hoja('#1565c0', '📝', 'Cargador', 'Anotar inscripciones y cobrar', '📱 Celular',
  bloque(1, 'Activar (una sola vez, con internet)', [
    'Escaneá el QR con la cámara e instalá la app (te dice cómo).',
    f'Abrí la app <b>desde el ícono nuevo</b> y tocá {b("Activar con QR")} (o escribí el código de debajo del QR). Desde ahí funciona sin señal.']) +
  bloque(2, 'Anotar a alguien', [
    f'{b("+ Nueva inscripción")} → completá los datos. Elegí la categoría si hay. <b>Grupos:</b> el grupo y cada integrante (⭐ responsable).',
    'Elegí el <b>medio de pago</b>. Transferencia: banco o billetera y los <b>últimos 6</b> de la operación.',
    f'{b("Revisar y cobrar")} → leé todo con la persona. <b>Cobrá exactamente el total</b> que muestra la app.',
    f'{b("Sí, guardar inscripción")}. El día del evento, si la persona ya llegó, tildá <b>«Ya está presente»</b>.']) +
  bloque(3, 'Mirá el color de cada inscripción', []) + ESTADOS +
  bloque(4, 'Al terminar tu turno', [
    f'Conectate a internet y tocá {b("Enviar ahora")} hasta ver <b>«🟢 Todo enviado»</b>.',
    f'Abrí {b("Resumen para rendir")} y entregale al Tesorero <b>el efectivo y los tickets de la terminal</b>.']) +
  nunca(['Borrar ni desinstalar la app si queda algo en 🟡: se pierde.',
         'Cambiar el monto. Si no te cierra, no guardes y consultá.',
         'Cargar dos veces a la misma persona (si pasa, avisá).']) +
  '<div class="ok">🧪 Si arriba dice <b>PRÁCTICA</b>, nada es real: cobrá de mentira y no entregues dinero.</div>' +
  si([('No hay internet', 'Seguí cargando. Se envía sola cuando vuelve la señal.'),
      ('Quedó en 🔴', 'No la cargues de nuevo. Mostrale la pantalla al organizador.'),
      ('El QR no se activa', 'Necesitás internet. Abrí desde el ícono. Si venció, pedí otro.'),
      ('Perdí el celular u otro QR', 'Si lo perdiste, avisá al organizador. Otro QR: escanealo y la app pregunta.')]) +
  datos(['Evento', 'Mi horario', 'Organizador', 'Su teléfono', 'Tesorero', 'Su teléfono'])),

# ------------------------------------------------------------------ PRESENTES
'Guia-rapida-Control-de-presentes': hoja('#2e7d32', '✅', 'Control de presentes', 'Marcar quién llega, en la puerta', '📱 Celular',
  bloque(1, 'Activar (una sola vez, con internet)', [
    'Escaneá el QR con la cámara e instalá la app (te dice cómo).',
    f'Abrí la app <b>desde el ícono nuevo</b> → {b("Activar con QR")} (o escribí el código de debajo del QR).',
    'Esperá a que baje la lista de inscriptos. Después funciona sin señal.']) +
  bloque(2, 'Cuando llega alguien', [
    'Arriba dice qué momento estás tomando (por ejemplo, «Sábado mañana»). Si no es el correcto, tocá ' + b('Cambiar') + '.',
    'Preguntá <b>nombre o DNI</b> y escribí <b>2 o 3 letras o números</b>: la lista se achica sola.',
    f'Tocá {b("✓ Presente")}. ¿Te equivocaste? Tocá {b("Deshacer")} enseguida.']) +
  '<div class="cols"><div>' + bloque(3, 'Qué significa', [
    '<b>En verde:</b> ya la marcaron (dice hora y quién; «Se anotó solo» = usó el QR de la entrada). No hace falta hacer nada.',
    '<b>Tachada:</b> anulada. Mandala a hablar con el organizador.',
    '<b>No aparece:</b> probá con el apellido o el DNI; si no está, mandala con un cargador.']) +
  '</div><div>' + bloque(4, 'Al terminar', [
    f'Conectate a internet y tocá {b("Enviar ahora")} si quedó algo sin enviar.',
    f'Tocá {b("Terminar y borrar la lista de este celular")}. (Al vencer tu horario se borra sola.)']) + '</div></div>' +
  '<div class="ok">👥 Puede haber varios celulares en la puerta: las marcas se comparten solas cuando hay señal y nadie queda marcado dos veces.</div>' +
  nunca(['Inscribir gente desde la puerta: eso lo hace un cargador.',
         'Desinstalar la app con marcas sin enviar.',
         'Mostrarle la lista a otras personas: tiene datos personales.']) +
  si([('No hay internet', 'Seguí marcando. Se comparte cuando vuelve la señal.'),
      ('Marqué a otra persona y ya pasó un rato', 'Avisá al organizador: él quita la marca desde el panel.'),
      ('Se inscribió recién y no aparece', 'Con señal, esperá unos segundos: la lista se actualiza sola.'),
      ('El QR no se activa', 'Necesitás internet. Abrí desde el ícono. Si venció, pedí otro.'),
      ('Me dieron el QR de otro evento', 'Escanealo: la app pregunta si querés cambiar (antes enviá las marcas pendientes).')]) +
  datos(['Evento', 'Mi horario', 'Organizador', 'Su teléfono'])),

# ------------------------------------------------------------------ ORGANIZADOR
'Guia-rapida-Organizador': hoja('#6a1b9a', '🗓️', 'Organizador', 'Crear eventos, dar QR, revisar y corregir', '💻 Computadora',
  INGRESO +
  '<div class="cols"><div>' + bloque(2, 'Antes del evento', [
    f'{b("Crear eventos")}: el asistente pregunta de a una cosa. Para no empezar de cero, {b("Copiar otro evento")}.',
    '<b>Probá el formulario en la vista previa.</b> Al abrir el evento, formulario y precios quedan fijos.',
    f'{b("QR de colaboradores")} → {b("+ QR de cargador")}, {b("+ QR de control de presentes")} o {b("+ QR de autopresente")} → {b("Crear QR")}.',
    f'{b("🖨️ Imprimir")} o {b("📤 Compartir (WhatsApp)")}. <b>El código se ve una sola vez.</b> Un QR = una persona y un celular.',
    f'<b>Antes del primer evento real, practicá</b>: {b("Crear evento de práctica")} (10 min; sirve para capacitar).']) +
  '</div><div>' + bloque(3, 'Durante el evento', [
    f'{b("Resumen")}: inscriptos, dinero y presentes. Mirá la <b>última conexión</b> de cada cargador.',
    'Para frenar las inscripciones: <b>Cerrar las inscripciones</b> (se pueden volver a abrir). La puerta sigue andando.',
    f'¿Perdió el celular? {b("Cerrar este QR")} y dale uno nuevo.',
    f'Otro momento de asistencia: {b("Editar momentos de asistencia")}.']) + '</div></div>' +
  bloque(4, 'Revisar y corregir', [
    f'{b("Inscripciones")} → <b>Para revisar</b>: posibles duplicados, fuera de horario o monto distinto.',
    f'Si está bien: {b("✓ Revisada: está bien")}. Si está mal: {b("Anular")} y que la carguen de nuevo.',
    'Se pueden corregir datos y medio de pago. <b>El monto no:</b> si el error es de precio o categoría, se anula y se carga otra vez.',
    f'Todo cambio pide <b>motivo</b> y queda registrado. Para planillas: {b("⤓ Descargar Excel")}.']) +
  nunca(['Abrir el evento sin probar antes el formulario en la vista previa.',
         'Mandar un QR a dos personas, ni corregir en el Excel.']) +
  si([('No me llega el código', 'Mirá Spam y Promociones. Si dice «no habilitado», pedile el alta al Responsable general.'),
      ('El panel muestra menos de lo cargado', 'Algún celular no envió. Pedile que se conecte y toque «Enviar ahora».'),
      ('Creé un evento por error', '«Resumen» → abajo, «Borrar o archivar este evento…».')]) +
  datos(['Dirección del panel', 'Mi correo', 'Responsable general', 'Su teléfono', 'Tesorero', 'Su teléfono'])),

# ------------------------------------------------------------------ TESORERO
'Guia-rapida-Tesorero': hoja('#ef6c00', '💵', 'Tesorero', 'Recibir y registrar el efectivo de los cargadores', '💻 Computadora',
  INGRESO +
  bloque(2, 'Antes de recibir la plata', [
    '<b>La primera vez, practicá</b> con el evento de práctica (🧪): elegilo en «Rendiciones» y registrá una entrega.',
    'Pedile al cargador que conecte el celular a internet y te muestre <b>«🟢 Todo enviado»</b>.',
    f'Si no, el panel todavía no tiene todas sus inscripciones. Esperá a que toque {b("Enviar ahora")}.']) +
  bloque(3, 'Registrar la entrega', [
    f'{b("Rendiciones")}: cada cargador aparece con el efectivo y los <b>tickets de terminal</b> que le faltan.',
    f'Contá el efectivo y tocá {b("Registrar entrega")} en su fila.',
    f'Escribí <b>el efectivo y los tickets</b> que realmente te dio (si falta o sobra, anotalo en la observación) → {b("Registrar")}.',
    '<b>Se rinde el efectivo y los tickets en papel de la terminal.</b> Las transferencias ya están en la cuenta.']) +
  '<div class="cols"><div>' + bloque(4, 'Si te equivocaste', [
    f'En el historial: {b("Anular")}, escribí el motivo y confirmá.',
    'Después registrala de nuevo bien.']) +
  '</div><div>' + bloque(5, 'Control', [
    f'{b("Resumen")}: cobrado, rendido y pendiente de cada cargador.',
    f'{b("⤓ Descargar Excel")}: hojas Inscriptos, Resumen por cargador y Rendiciones.']) + '</div></div>' +
  '<div class="ok">🧮 <b>Falta rendir</b> = efectivo cobrado − efectivo ya rendido. Las inscripciones anuladas no suman. Un número negativo quiere decir que se rindió de más.</div>' +
  nunca(['Recibir efectivo sin registrarlo en el momento.',
         'Registrar una entrega a nombre de otro cargador.',
         'Corregir montos en el Excel: es solo para mirar.']) +
  si([('El cargador dice que cobró más de lo que muestra el panel', 'Tiene inscripciones sin enviar: que se conecte y toque «Enviar ahora».'),
      ('Aparece «falta rendir» negativo', 'Se registró de más: revisá el historial y anulá la entrega equivocada.'),
      ('No me llega el código', 'Mirá Spam y Promociones. Si dice «no habilitado», pedile el alta al Responsable general.')]) +
  datos(['Dirección del panel', 'Mi correo', 'Organizador', 'Su teléfono'])),

# ------------------------------------------------------------------ CONSULTA
'Guia-rapida-Consulta': hoja('#00838f', '👀', 'Consulta', 'Mirar cómo va el evento y bajar el Excel', '💻 Computadora',
  INGRESO +
  bloque(2, 'Ver cómo va', [
    f'{b("Resumen")}: arriba elegí el evento. Ves inscriptos, dinero, efectivo por cargador, por categoría y por día.',
    'Más abajo, <b>Presentes</b>: cuántos llegaron en cada momento y la lista de <b>Ausentes</b>.',
    f'Se actualiza solo cada minuto. Para verlo ya: {b("Actualizar")}.']) +
  bloque(3, 'Buscar a una persona', [
    f'{b("Inscripciones")}: escribí parte del nombre, el DNI, el teléfono o el número de orden.',
    f'Tocá {b("Ver")} para ver todos sus datos y el historial de cambios.']) +
  bloque(4, 'Planilla', [
    f'{b("⤓ Descargar Excel")}: queda en la carpeta «Descargas». Se abre con Excel (o con Google Sheets).',
    'Hojas: Inscriptos, Resumen por cargador y Rendiciones.']) +
  '<div class="ok">🔒 Este rol <b>solo mira</b>: no puede cambiar, anular ni registrar nada. No hay forma de romper algo.</div>' +
  si([('Veo menos inscripciones de las que me dijeron', 'El panel muestra lo que ya llegó. Algún celular puede estar sin enviar.'),
      ('Encontré un error en una inscripción', 'Avisale al Organizador: él lo corrige en la app (no en el Excel).'),
      ('No me llega el código', 'Mirá Spam y Promociones. Si dice «no habilitado», pedile el alta al Responsable general.')]) +
  datos(['Dirección del panel', 'Mi correo', 'Organizador', 'Su teléfono'])),

# ------------------------------------------------------------------ RESPONSABLE GENERAL
'Guia-rapida-Responsable-general': hoja('#37474f', '🔑', 'Responsable general', 'Personas, roles, institución y mantenimiento', '💻 Computadora',
  bloque(1, 'Entrar y empezar', [
    'Abrí la dirección de la app terminada en <b>/#panel</b> → tu correo → código de 6 números.',
    f'En {b("Resumen")} seguí la lista <b>Primeros pasos</b> hasta que diga «Primeros pasos completos». Uno de ellos es <b>hacer la práctica</b>.']) +
  '<div class="cols"><div>' + bloque(2, 'Personas y roles', [
    f'{b("Personas y roles")} → agregá nombre, <b>correo con el que va a entrar</b> y tildá los roles.',
    'Una persona puede tener varios roles. Mejor que quien anula (Organizador) no sea quien recibe la plata (Tesorero).',
    f'Para quitar el acceso: {b("Modificar")} → destildá <b>Puede ingresar</b>. No se borra nada.',
    'Siempre queda al menos un Responsable general.']) +
  '</div><div>' + bloque(3, 'La institución', [
    f'{b("Institución")}: nombre, nombre corto, colores, logo, aviso de salud y contacto.',
    'Abajo ves cómo queda. Los celulares lo toman al abrir la app con internet.']) +
  bloque(4, 'Versión nueva', [
    'En GitHub: <b>Actions → Actualizar → Run workflow</b> (y en el panel, otra vez <b>Run workflow</b>). Unos 5 minutos, sin perder datos.']) + '</div></div>' +
  bloque(5, 'Mantenimiento: casi todo es automático', [
    'Todos los días a la madrugada se hace un <b>respaldo cifrado</b> y se prueba que se puede recuperar.',
    'Si algo falla, <b>llega un correo de GitHub</b> al Gmail de la institución: buscá ese caso en la guía «¿Qué hago si…?».',
    'Guardá la <b>hoja de accesos</b> impresa en un lugar seguro: ahí están las claves para recuperar todo.']) +
  nunca(['Compartir el Gmail de la institución ni la hoja de accesos.',
         'Borrar la clave de respaldo (CLAVE_RESPALDO): sin ella los respaldos no se pueden abrir.',
         'Irte sin darle el rol Responsable general a otra persona y entregarle la hoja de accesos.']) +
  si([('Aparece «La base de datos está desactualizada»', 'GitHub → Actions → Actualizar → Run workflow (2 veces: arriba a la derecha y abajo del panel). Después F5.'),
      ('Correo «falló el Respaldo diario»', 'GitHub → Actions → Respaldo diario: abrí la ejecución en rojo y seguí la guía «¿Qué hago si…?».'),
      ('La base está «dormida» (no conecta)', 'Nada: se despierta sola 2 veces por día. Con apuro: GitHub → Actions → Despertar la base → Run workflow (2 veces).'),
      ('A nadie le llega el código', 'Revisá la contraseña de aplicación del Gmail (manual de instalación) y tocá «Instalar» otra vez.')]) +
  datos(['Dirección del panel', 'Gmail de la institución', 'Hoja de accesos guardada en', 'Otro Responsable'])),
}


async def main():
    os.makedirs(SALIDA, exist_ok=True)
    errores = []
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pag = await nav.new_page()
        for nombre, cuerpo in GUIAS.items():
            html = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{nombre}</title><style>{CSS}</style></head><body>{cuerpo}</body></html>'
            ruta_html = os.path.join(SALIDA, nombre + '.html')
            open(ruta_html, 'w', encoding='utf-8').write(html)
            await pag.goto('file://' + ruta_html)
            await pag.wait_for_timeout(300)
            # Control: que nada se salga de la hoja (si el contenido no entra, la guía se recorta o pasa a 2 hojas).
            sobra = await pag.evaluate("""() => { const h = document.querySelector('.hoja');
                return h.scrollHeight - h.clientHeight; }""")
            if sobra > 1:
                errores.append(f'{nombre}: el contenido no entra en una hoja (sobran {sobra}px)')
            await pag.pdf(path=os.path.join(SALIDA, nombre + '.pdf'), format='A4', print_background=True,
                          margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
            await pag.screenshot(path=os.path.join(SALIDA, nombre + '.png'), full_page=True)
        await nav.close()
    from pypdf import PdfReader
    for nombre in GUIAS:
        n = len(PdfReader(os.path.join(SALIDA, nombre + '.pdf')).pages)
        if n != 1:
            errores.append(f'{nombre}: el PDF tiene {n} hojas (tiene que tener 1)')
    if errores:
        print('\n'.join(errores)); sys.exit(1)
    print(f'{len(GUIAS)} guías armadas en {SALIDA}')

if __name__ == '__main__':
    asyncio.run(main())
