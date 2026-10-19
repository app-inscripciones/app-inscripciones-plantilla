"""Pasa el manual del proyecto (manual-proyecto.md, que vive en el Proyecto de claude.ai) a PDF.
Uso: python3 armar_pdf.py ruta/manual-proyecto.md [salida.pdf]"""
import asyncio, os, sys, re, html
import markdown
from playwright.async_api import async_playwright

CSS = """
@page{size:A4;margin:16mm 15mm 18mm}
body{font-family:Inter,Arial,sans-serif;color:#1d1d1f;font-size:10.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.portada{height:250mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;page-break-after:always}
.portada img{width:44mm;margin-bottom:10mm}.portada h1{font-size:28pt;color:#1F4E79;margin:0 0 4mm;border:0}
.portada p{font-size:13pt;margin:1mm 0;color:#374151}.portada .autor{margin-top:18mm;font-size:10pt;color:#6b7280}
h1{font-size:19pt;color:#1F4E79;border-bottom:.8mm solid #1F4E79;padding-bottom:1.5mm;page-break-before:always;margin-top:0}
h1:first-of-type{page-break-before:avoid}
h2{font-size:14pt;color:#1F4E79;margin:7mm 0 2mm;page-break-after:avoid}
h3{font-size:12pt;margin:5mm 0 1.5mm;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:9.4pt;page-break-inside:auto}
th,td{border:.25mm solid #c9ced6;padding:1.4mm 2mm;vertical-align:top;text-align:left}th{background:#eef3f9}
tr{page-break-inside:avoid}
blockquote{margin:3mm 0;padding:2mm 4mm;background:#eef4fb;border-left:1.4mm solid #1F4E79;border-radius:1.5mm}
code{background:#f1f3f5;border-radius:1mm;padding:0 1mm;font-size:9pt;word-break:break-word}
hr{border:0;border-top:.3mm solid #d0d4da;margin:6mm 0}
"""

async def main():
    origen = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Manual-del-proyecto.pdf')
    md = open(origen, encoding='utf-8').read()
    fecha = (re.search(r'Última actualización: ([0-9/]+)', md) or [None, ''])[1]
    md = re.sub(r'^# Manual del sistema de inscripciones a eventos\s*', '', md, count=1)
    cuerpo = markdown.markdown(md, extensions=['tables'])
    logo = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'icono-512.png'))
    portada = f'''<section class="portada"><img src="{logo}"><h1>Manual del sistema de inscripciones a eventos</h1>
<p>Qué es, cómo funciona, quién puede hacer qué y cómo se armó, paso a paso.</p><p>Versión del {html.escape(fecha)}</p>
<p class="autor">Aplicación gratuita para instituciones · Creada por Carlos Coschiza</p></section>'''
    doc = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual del proyecto</title><style>{CSS}</style></head><body>{portada}{cuerpo}</body></html>'
    tmp = salida.replace('.pdf', '.html'); open(tmp, 'w', encoding='utf-8').write(doc)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.goto('file://' + os.path.abspath(tmp)); await pg.wait_for_timeout(500)
        await pg.pdf(path=salida, format='A4', print_background=True, display_header_footer=True, header_template='<span></span>',
                     footer_template=f'<div style="font-size:8px;color:#888;width:100%;text-align:center;font-family:Arial">Manual del sistema de inscripciones · {fecha} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
                     margin={'top': '16mm', 'bottom': '18mm', 'left': '15mm', 'right': '15mm'})
        await b.close()
    os.remove(tmp); print('ok', salida)

asyncio.run(main())
