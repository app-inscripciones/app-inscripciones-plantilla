"""D67 · Arma la carpeta para la institución (para copiar a un pendrive): «Sistema de inscripciones».

Uso:  python3 armar_carpeta.py
  → salida/Sistema de inscripciones/ (EMPEZAR-AQUÍ.html y los documentos numerados) y salida/Sistema-de-inscripciones.zip

Antes hay que tener armados los manuales por rol (herramientas/manuales: capturar.py, capturar_roles.py, armar_manuales.py,
pdf.py) y las guías rápidas (herramientas/guias-rapidas/armar_guias.py). Los textos de la instalación y de «después de
instalar» están en textos/*.md; la guía «¿Qué hago si…?» sale de la app (src/ayuda/queHagoSi.js).
Genérica: no nombra a ninguna institución.
"""
import asyncio, os, shutil, subprocess, sys, zipfile, html
import markdown
from playwright.async_api import async_playwright

DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(DIR, '..', '..'))
SALIDA = os.path.join(DIR, 'salida')
CARPETA = os.path.join(SALIDA, 'Sistema de inscripciones')
VERSION = 'Versión 1.0 · piloto · 19/10/2026'

CSS_DOC = """
@page{size:A4;margin:16mm 16mm 18mm}
body{font-family:Inter,Arial,sans-serif;color:#1d1d1f;font-size:11pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:22pt;color:#1F4E79;margin:0 0 4mm;border-bottom:1.2mm solid #1F4E79;padding-bottom:2mm}
h2{font-size:15pt;color:#1F4E79;margin:7mm 0 2mm;page-break-after:avoid}
h3{font-size:12.5pt;margin:5mm 0 1.5mm;page-break-after:avoid}
blockquote{margin:3mm 0;padding:2.5mm 4mm;background:#eef4fa;border-left:1.5mm solid #1F4E79;border-radius:1.5mm;page-break-inside:avoid}
blockquote p{margin:0}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:10pt;page-break-inside:avoid}
th,td{border:.3mm solid #c9cfd6;padding:1.6mm 2.2mm;text-align:left;vertical-align:top}
th{background:#eef1f5}
code{background:#f1f3f5;padding:0 1mm;border-radius:1mm;font-size:10pt}
li{margin:.8mm 0}
hr{border:0;border-top:.4mm solid #d0d4da;margin:6mm 0}
.pie{color:#6b7280;font-size:9pt;margin-top:8mm}
"""

def md_a_html(md_texto, titulo):
    cuerpo = markdown.markdown(md_texto, extensions=['tables'])
    # Recuadros especiales: «📝 Anotá en la hoja» y «✅ Cómo sé que salió bien»
    cuerpo = cuerpo.replace('<blockquote>\n<p>📝', '<blockquote style="background:#fff7e0;border-color:#e6a700">\n<p>📝')
    cuerpo = cuerpo.replace('<blockquote>\n<p>✅', '<blockquote style="background:#e8f5e9;border-color:#2e7d32">\n<p>✅')
    return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{html.escape(titulo)}</title><style>{CSS_DOC}</style></head><body>{cuerpo}<p class="pie">Sistema de inscripciones · {VERSION}</p></body></html>'

# ---------------------------------------------------------------- 1 · Hoja de accesos
def fila(cod, texto, alto=9, ayuda=''):
    a = f'<small>{ayuda}</small>' if ayuda else ''
    return f'<tr><td class="cod">{cod}</td><td class="et">{texto}{a}</td><td class="esp" style="height:{alto}mm"></td></tr>'

def tilde(cod, texto):
    return f'<tr><td class="cod">{cod}</td><td class="et" colspan="2">☐ {texto}</td></tr>'

def bloque(letra, titulo, filas, nota=''):
    n = f'<p class="nota">{nota}</p>' if nota else ''
    return f'<section class="bloque"><h2><span>{letra}</span>{titulo}</h2>{n}<table>{"".join(filas)}</table></section>'

HOJA_CSS = """
@page{size:A4;margin:11mm 12mm 12mm}
body{font-family:Inter,Arial,sans-serif;color:#1d1d1f;font-size:9.6pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1mm solid #1F4E79;padding-bottom:2mm;margin-bottom:3mm}
header h1{margin:0;font-size:19pt;color:#1F4E79}
header p{margin:1mm 0 0;font-size:9.5pt}
.alerta{background:#fdecec;border-left:1.6mm solid #c62828;border-radius:1.5mm;padding:2mm 3mm;margin:0 0 3mm;font-size:9.4pt}
.bloque{page-break-inside:avoid;margin-bottom:3mm}
.bloque h2{font-size:11.5pt;margin:0 0 1mm;color:#1F4E79;display:flex;gap:2mm;align-items:center}
.bloque h2 span{background:#1F4E79;color:#fff;border-radius:1.5mm;padding:.3mm 2mm}
.nota{margin:0 0 1mm;font-size:8.8pt;color:#374151}
table{border-collapse:collapse;width:100%}
td{border:.3mm solid #b8c0ca;padding:1mm 1.8mm;vertical-align:middle}
td.cod{width:9mm;font-weight:700;text-align:center;background:#eef1f5}
td.et{width:62mm}
td.et small{display:block;color:#6b7280;font-size:7.8pt}
.cajitas{display:grid;grid-template-columns:repeat(5,1fr);gap:1.5mm;padding:1mm 0}
.cajitas div{border-bottom:.3mm solid #9aa3ad;height:7mm}
.F td.esp{background:#fff7e0}
"""

def hoja_html():
    cajitas = '<div class="cajitas">' + '<div></div>' * 10 + '</div>'
    partes = [
        '<header><div><h1>📋 Hoja de accesos</h1><p>Sistema de inscripciones · completar <b>a mano</b>, con lapicera, a medida que se sigue la instalación.</p></div>'
        f'<p style="text-align:right">Institución: ______________________<br><br>{VERSION}</p></header>',
        '<div class="alerta"><b>⛔ Es la llave de todo.</b> Guardala impresa en un lugar seguro (por ejemplo, con otros papeles importantes de la institución). '
        '<b>Nunca</b> la fotografíes, ni la mandes por WhatsApp o correo, ni la copies en la computadora o en la nube. Si cambiás una contraseña, tachá la vieja y anotá la nueva con la fecha. '
        'Si cambia el Responsable general, se le entrega esta hoja en mano.</div>',
        '<p class="nota">Cada renglón dice <b>qué</b> anotar y, en gris, <b>de dónde sale</b>. Lo que no figura en la hoja no hace falta anotarlo. Los manuales indican en cada paso qué casillas completar (por ejemplo, «📝 Anotá en la hoja: B2»).</p>',
        bloque('A', 'Responsable general', [
            fila('A1', 'Nombre y apellido'), fila('A2', 'Correo con el que entra al panel'), fila('A3', 'Celular'),
        ]),
        bloque('B', 'Gmail de la institución (paso 1)', [
            fila('B1', 'Dirección de Gmail'), fila('B2', 'Contraseña'), fila('B3', 'Celular de verificación'),
            fila('B4', 'Correo de recuperación'),
            f'<tr><td class="cod">B5</td><td class="et">Códigos de seguridad<small>Los 10 códigos de 8 números</small></td><td class="esp">{cajitas}</td></tr>',
            fila('B6', 'Contraseña de aplicación', 9, '16 letras · «Supabase» · se carga en GitHub como GMAIL_CLAVE_APLICACION'),
        ]),
        bloque('C', 'GitHub (pasos 2 y 3)', [
            fila('C1', 'Usuario'), fila('C2', 'Contraseña'), fila('C3', 'Celular con Google Authenticator'),
            fila('C4', 'Dónde están los recovery codes', 9, 'Imprimilos y guardalos con esta hoja'),
            fila('C5', 'Dirección del repositorio', 9, 'github.com/…/app-inscripciones (Private)'),
        ]),
        bloque('D', 'Supabase (paso 4)', [
            fila('D1', 'Nombre de la organización', 8, 'Se entra con «Continue with GitHub»: no tiene contraseña propia'),
            tilde('D2', 'Llave «Instalador» cargada en GitHub como SUPABASE_ACCESS_TOKEN (la llave no se anota)'),
        ]),
        bloque('E', 'Cloudflare (paso 5)', [
            fila('E1', 'Contraseña'), fila('E2', 'Dónde están los backup codes'),
            fila('E3', 'Vencimiento de la llave «Instalador»', 8, 'Si no tiene, escribí «no vence»'),
            tilde('E4', 'Llave cargada en GitHub como CLOUDFLARE_API_TOKEN (la llave no se anota)'),
        ]),
        '<div class="F">' + bloque('F', 'Clave de respaldo (paso 6) · LA MÁS IMPORTANTE', [
            fila('F1', 'CLAVE_RESPALDO', 13, 'Inventada, mínimo 16 caracteres. Sin ella NO se pueden abrir los respaldos. Escribila con letra clara'),
        ], '<b>No es una cuenta:</b> no tiene dirección web, ni usuario, ni correo. La inventás vos, la anotás acá y la pegás una sola vez en GitHub, como secreto <b>CLAVE_RESPALDO</b>. Después GitHub no la deja ver nunca más: <b>esta hoja es la única copia</b>. Si alguna vez se cambia, la clave vieja sigue haciendo falta para los respaldos anteriores: no la tachés, anotá al lado la nueva con la fecha.') + '</div>',
        bloque('G', 'Instalación (pasos 7 y 8)', [
            fila('G1', 'Fecha de instalación'), fila('G2', 'Dirección de la aplicación', 9, '…pages.dev'),
            fila('G3', 'Dirección del panel', 9, '…pages.dev/#panel'),
            tilde('G4', 'Primer ingreso al panel con el código por correo: funciona'),
        ]),
        bloque('H', 'Cambios (contraseñas, llaves, responsables)', [
            '<tr><td class="cod">Fecha</td><td class="et">Qué cambió</td><td class="esp">Quién</td></tr>',
            *['<tr><td style="height:8mm"></td><td></td><td></td></tr>'] * 5,
        ]),
    ]
    return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de accesos</title><style>{HOJA_CSS}</style></head><body>{"".join(partes)}</body></html>'

# ---------------------------------------------------------------- EMPEZAR-AQUÍ
# Videos que van dentro de la carpeta (se ven sin internet). Se arman con herramientas/videos/presentacion y herramientas/videos/roles.
_V = os.path.join(RAIZ, 'herramientas', 'videos')
VIDEOS_LOCALES = [
    ('0 - Presentación.mp4', os.path.join(_V, 'presentacion', 'video-presentacion.mp4'), 'Presentación de la aplicación (se mira primero)'),
    ('1 - Responsable general.mp4', os.path.join(_V, 'roles', 'videos', 'video-responsable.mp4'), 'Responsable general'),
    ('2 - Organizador.mp4', os.path.join(_V, 'roles', 'videos', 'video-organizador.mp4'), 'Organizador'),
    ('3 - Tesorero.mp4', os.path.join(_V, 'roles', 'videos', 'video-tesorero.mp4'), 'Tesorero'),
    ('4 - Consulta.mp4', os.path.join(_V, 'roles', 'videos', 'video-consulta.mp4'), 'Consulta'),
    ('5 - Cargador (celular).mp4', os.path.join(_V, 'roles', 'videos', 'video-cargador.mp4'), 'Cargador (celular)'),
    ('6 - Control de presentes (celular).mp4', os.path.join(_V, 'roles', 'videos', 'video-presentes.mp4'), 'Control de presentes (celular)'),
]
# Enlace al video de presentación (R27): va primero. Vacío hasta que esté publicado (mientras, se usa el archivo de la carpeta).
VIDEO_PRESENTACION = ''
PASOS = [
    ('hoja', '1', 'Imprimí la Hoja de accesos', 'Antes de empezar. Vas a ir anotando ahí, a mano, cada cuenta y contraseña que crees.', '1 · Hoja de accesos.pdf', '📋'),
    ('instalar', '2', 'Instalá el sistema', 'Paso a paso, desde crear el Gmail hasta el botón «Instalar». Entre 1 hora y 1 hora y media, con la computadora y un celular. Se puede hacer en partes.', '2 · Instalación paso a paso.pdf', '🛠️'),
    ('despues', '3', 'Dejá todo listo', 'Datos de la institución, el equipo, la práctica (10 minutos) y el primer evento real.', '3 · Después de instalar.pdf', '✅'),
    ('roles', '4', 'Repartí los manuales por rol', 'Uno para cada rol: Responsable general, Organizador, Tesorero, Consulta, Cargador y Control de presentes.', '4 · Manuales por rol', '📘'),
    ('guias', '5', 'Imprimí las guías rápidas', 'Una hoja por rol, para tener a mano el día del evento.', '5 · Guías rápidas para imprimir', '🗒️'),
    ('ayuda', '6', 'Tené a mano «¿Qué hago si…?»', 'Los problemas frecuentes y qué hacer. También está dentro de la aplicación.', '6 · ¿Qué hago si…?.pdf', '🛟'),
    ('videos', '7', 'Mirá los videos', 'Uno por rol: cómo se usa cada pantalla, sin voz y con letras grandes. Pasáselos a cada persona según su rol.', '7 · Videos/Ver los videos.html', '🎬'),
]

def empezar_html():
    items = []
    for pid, num, titulo, texto, destino, icono in PASOS:
        enlace = destino.replace(' ', '%20').replace('·', '%C2%B7').replace('¿', '%C2%BF').replace('…', '%E2%80%A6')
        items.append(f'''<li class="paso" id="p-{pid}">
  <span class="num">{num}</span>
  <div class="txt"><h2>{icono} {html.escape(titulo)}</h2><p>{html.escape(texto)}</p>
    <a class="abrir" href="{enlace}">Abrir «{html.escape(destino)}»</a></div>
  <label class="hecho"><input type="checkbox" data-paso="{pid}"> Hecho</label>
</li>''')
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Empezar aquí · Sistema de inscripciones</title>
<style>
:root{{--p:#1F4E79;--f:#f6f7f9;--b:#d0d4da;--ok:#e8f5e9}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--f);font-family:Inter,Arial,sans-serif;color:#1d1d1f;font-size:17px;line-height:1.45}}
header{{background:var(--p);color:#fff;padding:24px 16px}} header div{{max-width:860px;margin:0 auto}}
header h1{{margin:0 0 6px;font-size:30px}} header p{{margin:0;font-size:18px;opacity:.95}}
main{{max-width:860px;margin:0 auto;padding:20px 16px 40px}}
.necesitas{{background:#fff;border:1px solid var(--b);border-radius:12px;padding:14px 18px;margin-bottom:18px}}
.necesitas h2{{margin:0 0 6px;font-size:19px}} .necesitas ul{{margin:0;padding-left:22px}}
ol.pasos{{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px}}
.paso{{display:flex;gap:14px;align-items:flex-start;background:#fff;border:2px solid var(--b);border-radius:14px;padding:14px 16px}}
.paso.listo{{background:var(--ok);border-color:#a5d6a7}}
.num{{flex:none;width:44px;height:44px;border-radius:50%;background:var(--p);color:#fff;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center}}
.paso.listo .num{{background:#2e7d32}}
.txt{{flex:1}} .txt h2{{margin:2px 0 4px;font-size:21px}} .txt p{{margin:0 0 8px}}
.abrir{{display:inline-block;background:var(--p);color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 14px}}
.hecho{{flex:none;display:flex;gap:6px;align-items:center;font-weight:600;font-size:16px;cursor:pointer;padding-top:8px}}
.hecho input{{width:22px;height:22px}}
.presentacion{{display:flex;gap:14px;align-items:flex-start;background:#eef4fb;border:2px solid var(--p);border-radius:14px;padding:14px 18px;margin:0 0 18px}}
.presentacion h2{{margin:0 0 4px;font-size:21px}} .presentacion p{{margin:0}} .icono-video{{font-size:34px}}
.importante{{background:#fdecec;border-left:6px solid #c62828;border-radius:10px;padding:12px 16px;margin:18px 0}}
footer{{color:#6b7280;font-size:14px;margin-top:20px}}
.opinion{{background:#fff;border:1px solid var(--b);border-radius:12px;padding:14px 18px;margin-top:18px}} .opinion h2{{margin:0 0 6px;font-size:19px}}
.opinion label{{display:block;font-weight:600;margin:10px 0 0}} .opinion textarea{{display:block;width:100%;min-height:60px;margin-top:4px;font:inherit;padding:8px;border:1px solid var(--b);border-radius:8px}}
.opinion button{{border:0;cursor:pointer;font:inherit;margin-top:12px}} .chico{{font-size:14px;color:#4b5563}}
@media (max-width:600px){{.paso{{flex-wrap:wrap}} .hecho{{width:100%}}}}
</style></head><body>
<header><div><h1>👋 Empezá por acá</h1><p>Sistema de inscripciones a eventos: inscripciones con y sin internet, control del dinero por colaborador y presentes en la puerta.</p></div></header>
<main>
<div class="presentacion"><span class="icono-video">▶️</span><div><h2>Antes de empezar: el video de presentación</h2>
<p>Qué es la aplicación, para qué sirve y por qué los datos son solo de la institución. Unos minutos.
{f'<br><a class="abrir" href="{VIDEO_PRESENTACION}" target="_blank" rel="noopener">Ver el video</a>' if VIDEO_PRESENTACION else ('<br><a class="abrir" href="7%20%C2%B7%20Videos/0%20-%20Presentaci%C3%B3n.mp4">Ver el video</a>' if os.path.exists(VIDEOS_LOCALES[0][1]) else '<br><i>(El enlace se agrega cuando el video esté publicado.)</i>')}</p></div></div>
<div class="necesitas"><h2>Qué hace falta</h2><ul>
<li>Una <b>computadora</b> con internet y el navegador <b>Chrome</b>, y un <b>celular</b>.</li>
<li>Unas <b>2 horas</b> en total (la instalación lleva entre 1 hora y 1 hora y media). <b>Se puede hacer en partes</b>: esta página recuerda lo que ya tildaste.</li>
<li>Una <b>impresora</b> para la Hoja de accesos y las guías rápidas (o pedí que te las impriman).</li>
<li>No hace falta saber de tecnología: seguí los pasos <b>en orden</b>, sin saltear ninguno.</li></ul></div>
<p><b>Hacé los pasos en este orden.</b> Cuando termines uno, tildá «Hecho»: esta página se acuerda (en esta computadora).</p>
<ol class="pasos">
{"".join(items)}
</ol>
<div class="importante"><b>⛔ Importante:</b> las contraseñas y claves se anotan <b>solo a mano</b>, en la Hoja de accesos impresa. Nunca en la computadora, en el correo ni en WhatsApp.</div>
<section class="opinion"><h2>💬 Al terminar: contanos cómo te fue</h2>
<p>Nadie te va a observar ni acompañar: el paquete tiene que alcanzar solo. Para mejorarlo para las próximas instituciones, respondé estas preguntas (se guardan en esta computadora) y mandáselas a quien te pasó el paquete.</p>
<label>1. ¿En qué paso dudaste, te trabaste o tuviste que volver atrás?<textarea data-preg="1"></textarea></label>
<label>2. ¿Qué pantalla o palabra no entendiste?<textarea data-preg="2"></textarea></label>
<label>3. ¿Cuánto tardaste en total, más o menos?<textarea data-preg="3" rows="1"></textarea></label>
<button type="button" id="copiar-opinion" class="abrir">Copiar las respuestas</button> <span id="copiado"></span>
<p class="chico">Después de copiarlas, pegalas en un correo o en un mensaje. <b>No incluyas contraseñas ni claves.</b></p></section>
<footer>Si algo no sale, mirá el documento 6 («¿Qué hago si…?»). {VERSION}.</footer>
</main>
<script>
(function(){{
  var CLAVE='empezar-aqui-pasos';
  var hechos={{}};
  try{{hechos=JSON.parse(localStorage.getItem(CLAVE)||'{{}}')||{{}};}}catch(e){{hechos={{}};}}
  document.querySelectorAll('input[data-paso]').forEach(function(c){{
    var id=c.getAttribute('data-paso'); var li=document.getElementById('p-'+id);
    c.checked=!!hechos[id]; li.classList.toggle('listo',c.checked);
    c.addEventListener('change',function(){{
      hechos[id]=c.checked; li.classList.toggle('listo',c.checked);
      try{{localStorage.setItem(CLAVE,JSON.stringify(hechos));}}catch(e){{}}
    }});
  }});
  var CP='empezar-aqui-opinion'; var resp={{}};
  try{{resp=JSON.parse(localStorage.getItem(CP)||'{{}}')||{{}};}}catch(e){{resp={{}};}}
  var areas=document.querySelectorAll('textarea[data-preg]');
  areas.forEach(function(t){{
    var k=t.getAttribute('data-preg'); t.value=resp[k]||'';
    t.addEventListener('input',function(){{ resp[k]=t.value; try{{localStorage.setItem(CP,JSON.stringify(resp));}}catch(e){{}} }});
  }});
  document.getElementById('copiar-opinion').addEventListener('click',function(){{
    var NL=String.fromCharCode(10); var txt='Cómo me fue con la instalación (Sistema de inscripciones)'+NL+NL+Array.prototype.map.call(areas,function(t){{return t.parentNode.firstChild.textContent.trim()+NL+(t.value||'-')}}).join(NL+NL);
    var ok=function(){{document.getElementById('copiado').textContent='✔ Copiado. Pegalo en un correo o mensaje.';}};
    if(navigator.clipboard){{navigator.clipboard.writeText(txt).then(ok,function(){{prompt('Copiá este texto:',txt);}});}} else {{prompt('Copiá este texto:',txt);}}
  }});
}})();
</script>
</body></html>'''

def videos_html():
    items = ''.join(f'<li><b>{html.escape(t)}</b><br><video controls preload="metadata" src="{n.replace(" ", "%20")}"></video></li>'
                    for n, o, t in VIDEOS_LOCALES if os.path.exists(o))
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Videos</title>
<style>body{{font-family:Inter,Arial,sans-serif;max-width:900px;margin:30px auto;padding:0 16px;font-size:18px;line-height:1.5}}h1{{color:#1F4E79}}li{{margin:18px 0}}video{{width:100%;max-height:70vh;background:#000;border-radius:10px;margin-top:6px}}</style></head><body>
<h1>🎬 Videos</h1>
<p>Se ven sin internet. Para mandarle a cada persona el de su rol, compartí el archivo (por ejemplo, por WhatsApp) o el enlace de YouTube cuando esté publicado. El video de la instalación se agrega cuando se haga la instalación de prueba.</p>
<ol style="list-style:none;padding:0">{items}</ol>
<p style="color:#6b7280">{VERSION}</p></body></html>'''

async def a_pdf(b, html_texto, destino, pie=True):
    pg = await b.new_page()
    await pg.set_content(html_texto, wait_until='load')
    await pg.wait_for_timeout(300)
    kw = dict(path=destino, format='A4', print_background=True, prefer_css_page_size=True)
    if pie:
        kw.update(display_header_footer=True, header_template='<span></span>',
                  footer_template='<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:Arial">Sistema de inscripciones · <span class="pageNumber"></span>/<span class="totalPages"></span></div>')
    await pg.pdf(**kw)
    await pg.close()

async def main():
    shutil.rmtree(SALIDA, ignore_errors=True)
    os.makedirs(os.path.join(CARPETA, '4 · Manuales por rol'))
    os.makedirs(os.path.join(CARPETA, '5 · Guías rápidas para imprimir'))
    que_hago_si = subprocess.run(['node', os.path.join(RAIZ, 'herramientas', 'guias-rapidas', 'que_hago_si_md.mjs')], capture_output=True, text=True, check=True, cwd=RAIZ).stdout
    leer = lambda n: open(os.path.join(DIR, 'textos', n), encoding='utf-8').read()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await a_pdf(b, hoja_html(), os.path.join(CARPETA, '1 · Hoja de accesos.pdf'), pie=False)
        await a_pdf(b, md_a_html(leer('2-instalacion.md'), 'Instalación paso a paso'), os.path.join(CARPETA, '2 · Instalación paso a paso.pdf'))
        await a_pdf(b, md_a_html(leer('3-despues-de-instalar.md'), 'Después de instalar'), os.path.join(CARPETA, '3 · Después de instalar.pdf'))
        await a_pdf(b, md_a_html(que_hago_si, '¿Qué hago si…?'), os.path.join(CARPETA, '6 · ¿Qué hago si…?.pdf'))
        await b.close()
    faltan = []
    man = os.path.join(RAIZ, 'herramientas', 'manuales')
    for rol in ['Responsable-general', 'Organizador', 'Tesorero', 'Consulta', 'Cargador', 'Control-de-presentes']:
        o = os.path.join(man, f'Manual-{rol}-borrador.pdf')
        if os.path.exists(o): shutil.copy(o, os.path.join(CARPETA, '4 · Manuales por rol', f'Manual {rol.replace("-", " ")}.pdf'))
        else: faltan.append(o)
        g = os.path.join(RAIZ, 'herramientas', 'guias-rapidas', 'guias', f'Guia-rapida-{rol}.pdf')
        if os.path.exists(g): shutil.copy(g, os.path.join(CARPETA, '5 · Guías rápidas para imprimir', f'Guía rápida {rol.replace("-", " ")}.pdf'))
        else: faltan.append(g)
    with open(os.path.join(CARPETA, 'EMPEZAR-AQUÍ.html'), 'w', encoding='utf-8') as f: f.write(empezar_html())
    vd = os.path.join(CARPETA, '7 · Videos'); os.makedirs(vd, exist_ok=True)
    for n, o, t in VIDEOS_LOCALES:
        if os.path.exists(o): shutil.copy(o, os.path.join(vd, n))
        else: faltan.append(o)
    with open(os.path.join(vd, 'Ver los videos.html'), 'w', encoding='utf-8') as f: f.write(videos_html())
    zipf = os.path.join(SALIDA, 'Sistema-de-inscripciones.zip')
    with zipfile.ZipFile(zipf, 'w', zipfile.ZIP_DEFLATED) as z:
        for raiz, _, archivos in os.walk(CARPETA):
            for a in sorted(archivos):
                ruta = os.path.join(raiz, a); z.write(ruta, os.path.relpath(ruta, SALIDA))
    if faltan:
        print('FALTAN (armarlos antes):', *faltan, sep='\n  '); sys.exit(1)
    print('Carpeta armada:', CARPETA); print('ZIP:', zipf)

asyncio.run(main())
