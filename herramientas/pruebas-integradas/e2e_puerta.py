"""Prueba INTEGRADA del control de presentes (Etapa 4B): app real + PostgREST + base real."""
import asyncio, os, sys, re, subprocess, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL  # reutiliza el proxy y el ingreso con código
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_puerta'); os.makedirs(OUT, exist_ok=True)
HOY = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
n = [0]
async def foto(pg, nombre):
    n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png')

STANDALONE = "const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('standalone') ? { matches: true, media: q, addEventListener(){}, removeEventListener(){} } : mm(q); navigator.storage.persist = async () => true; navigator.storage.persisted = async () => true;"

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.add_init_script(STANDALONE)
    await c.route(re.compile(r'supabase\.co/'), ruta)
    p = await c.new_page(); return c, p

async def main():
    # El congreso «es hoy» para poder probar la puerta y «Ya está presente».
    subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-q', '-c',
        f"""update public.eventos set definicion = jsonb_set(definicion, '{{asistencia,instancias}}',
            '[{{"id":"llegada","nombre":"Llegada","fecha":"{HOY}"}},{{"id":"cierre","nombre":"Cierre","fecha":"2099-01-01"}}]') where id='congreso-prueba'"""], check=True)
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1200, 'height': 850}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        await pg.click('nav >> text=Personas y roles'); await pg.click('tr:has-text("carlos@gmail.com") >> text=Modificar')
        await pg.click('.rol-opcion:has-text("Organizador")'); await pg.click('button:has-text("Guardar")')
        await pg.wait_for_selector('tr:has-text("carlos@gmail.com") >> text=Organizador'); await pg.reload()
        await pg.click('nav >> text=QR de colaboradores')
        codigos = {}
        for nombre, boton in [('Ana Pérez', '+ QR de cargador'), ('Juan Ríos', '+ QR de control de presentes'), ('Lía Sosa', '+ QR de control de presentes')]:
            await pg.click(f'text={boton}'); await pg.fill('#nombre-colaborador', nombre); await pg.click('text=Crear QR')
            await pg.wait_for_selector('.qr-codigo'); codigos[nombre] = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')

        # Ana inscribe a 3 personas; a Laura la deja «Ya está presente»
        ca, pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigos['Ana Pérez']); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=Cargador:')
        g = lambda l: f'[role=radiogroup][aria-label="{l}"]'
        async def inscribir(nombre, dni, iglesia, presente=False):
            await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Adultos (casados o mayores de 30)")')
            for sel, val in [('#nombre', nombre), ('#dni', dni), ('#telefono', '3624000111'), ('#edad', '40'), ('#iglesia', iglesia)]:
                await pa.fill(sel, val)
            await pa.locator(g('¿Tiene intolerancia al gluten?') + ' button:has-text("No")').click()
            await pa.locator(g('¿Tiene otras restricciones alimentarias?') + ' button:has-text("No")').click()
            await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
            await pa.click('text=Revisar y cobrar')
            if presente:
                await pa.wait_for_selector('text=Ya está presente'); await pa.click('.ya-presente'); await foto(pa, 'cargador-ya-presente')
            await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        await inscribir('Laura Díaz', '35111222', 'Central', presente=True)
        await inscribir('Mario Gómez', '20111222', 'Bethel')
        await inscribir('Sofía Núñez', '40111222', 'Central')
        await pa.wait_for_selector('text=Todo enviado', timeout=20000)

        # Juan en la puerta
        cj, pj = await celular(b); pj.on('pageerror', lambda e: errores.append(str(e)))
        await pj.goto(URL); await pj.fill('#codigo-acceso', codigos['Juan Ríos']); await pj.click('text=Activar con el código')
        await pj.wait_for_selector('#buscar-puerta'); await pj.wait_for_selector('.contador-puerta >> text=de 3', timeout=15000)
        txt = await pj.inner_text('.contador-puerta'); assert '1' in txt, txt   # Laura ya está presente
        await foto(pj, 'puerta-inicio')
        await pj.fill('#buscar-puerta', 'gom'); await pj.wait_for_selector('.fila-puerta:has-text("Mario Gómez")'); await foto(pj, 'puerta-busca')
        await pj.click('.fila-puerta:has-text("Mario Gómez") >> .boton-presente'); await pj.wait_for_selector('.toast'); await foto(pj, 'puerta-marcado')
        await pj.click('.toast >> text=Deshacer'); await pj.wait_for_selector('text=Se deshizo')
        await pj.fill('#buscar-puerta', '20.111'); await pj.click('.fila-puerta:has-text("Mario Gómez") >> .boton-presente')
        await pj.fill('#buscar-puerta', 'laura'); await pj.wait_for_selector('.fila-puerta.presente:has-text("Laura")'); await foto(pj, 'puerta-ya-presente')
        await pj.fill('#buscar-puerta', 'zzzz'); await pj.wait_for_selector('text=No aparece en la lista'); await foto(pj, 'puerta-no-aparece')

        # Lía, sin internet, marca a Sofía; vuelve internet y Juan lo ve
        cl, pl = await celular(b); pl.on('pageerror', lambda e: errores.append(str(e)))
        await pl.goto(URL); await pl.fill('#codigo-acceso', codigos['Lía Sosa']); await pl.click('text=Activar con el código')
        await pl.wait_for_selector('.contador-puerta >> text=de 3', timeout=15000)
        await cl.set_offline(True)
        await pl.fill('#buscar-puerta', 'sofia nu'); await pl.click('.fila-puerta:has-text("Sofía") >> .boton-presente')
        await pl.wait_for_timeout(500); await foto(pl, 'puerta-sin-internet')
        await cl.set_offline(False); await pl.evaluate("window.dispatchEvent(new Event('online'))")
        await pj.fill('#buscar-puerta', 'sofia'); await pj.wait_for_selector('.fila-puerta.presente:has-text("Sofía") >> text=Lía Sosa', timeout=30000)
        await pj.wait_for_selector('.contador-puerta >> text=3', timeout=15000); await foto(pj, 'puerta-de-otro-celular')

        # Panel: presentes y Excel
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', 'congreso-prueba')
        await pg.wait_for_selector('h3:has-text("Presentes")'); await pg.wait_for_selector('td:has-text("Llegada")')
        await pg.click('td:has-text("Cierre") >> xpath=.. >> text=Ver ausentes'); await foto(pg, 'panel-presentes')
        print('--- presentes ---'); print(await pg.inner_text('main >> table >> nth=1'))
        async with pg.expect_download() as d: await pg.click('text=Descargar Excel')
        dl = await d.value; await dl.save_as(os.path.join(DIR, 'presentes.xlsx'))

        # El organizador cierra el QR de Juan: su celular pasa a solo envío y borra la lista
        await pg.click('nav >> text=QR de colaboradores'); await pg.click('.item:has-text("Juan Ríos") >> text=Cerrar este QR'); await pg.click('text=Sí, cerrar')
        await pj.reload(); await pj.wait_for_selector('text=El organizador cerró tu acceso', timeout=30000)
        await pj.wait_for_selector('text=Terminar y borrar la lista'); await foto(pj, 'puerta-cerrada')
        await pj.click('text=Terminar y borrar la lista'); await pj.wait_for_selector('text=Activar mi acceso')
        quedan = await pj.evaluate("""async () => { const r = indexedDB.open('inscripciones'); await new Promise(x => r.onsuccess = x);
            const tx = r.result.transaction('puerta'); const q = tx.objectStore('puerta').count(); await new Promise(x => q.onsuccess = x); return q.result; }""")
        print('inscriptos que quedan en el celular de Juan:', quedan); assert quedan == 0
        print('errores de página:', errores)
        await b.close()
        if errores: sys.exit(1)

asyncio.run(main())
