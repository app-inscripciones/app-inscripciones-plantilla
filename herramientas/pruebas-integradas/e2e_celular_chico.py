"""Prueba integrada: pantallas del celular en teléfonos chicos (320, 360 y 412 px de ancho).
Recorre activar → inicio → formulario (evento híbrido de práctica) → confirmar → lista → resumen para rendir → ayuda,
y la puerta. En cada pantalla controla que nada se salga a los costados (scroll horizontal) y que los botones
principales tengan al menos 40 px de alto (fáciles de tocar). Correr con la base recién cargada."""
import asyncio, os, sys, re, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_celular_chico'); os.makedirs(OUT, exist_ok=True)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()
problemas = []

async def revisar(pg, ancho, nombre):
    await pg.wait_for_timeout(300)
    sobra = await pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
    chicos = await pg.evaluate("""() => [...document.querySelectorAll('button.boton, .boton.principal, .boton-presente')]
        .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => b.innerText.trim().slice(0, 30))""")
    anchos = await pg.evaluate("""() => [...document.querySelectorAll('body *')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${e.className || ''} «${(e.innerText || '').trim().slice(0, 25)}»`)""")
    await pg.screenshot(path=f'{OUT}/{ancho}-{nombre}.png', full_page=True)
    if sobra > 1: problemas.append(f'{ancho}px · {nombre}: se sale {sobra}px a la derecha → {anchos}')
    if chicos: problemas.append(f'{ancho}px · {nombre}: botones de menos de 40px → {chicos}')

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, 'organizador' from public.usuarios where email = 'carlos@gmail.com' on conflict do nothing")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page()
        await ingresar(pg, 'carlos@gmail.com')
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-practica'); await pg.wait_for_selector('text=está abierto')
        await pg.click('text=Generar QR de colaboradores'); await pg.wait_for_selector('.aviso-practica')
        codigos = {}
        for ancho in (320, 360, 412):
            for tarea, boton in (('cargar', '+ QR de cargador'), ('puerta', '+ QR de control de presentes')):
                await pg.click(f'text={boton}'); await pg.fill('#nombre-colaborador', f'Chico {tarea} {ancho}'); await pg.click('text=Crear QR')
                await pg.wait_for_selector('.qr-codigo'); codigos[(ancho, tarea)] = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        for ancho in (320, 360, 412):
            c = await b.new_context(viewport={'width': ancho, 'height': 640}, is_mobile=True, has_touch=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
            await c.route(re.compile(r'supabase\.co/'), ruta)
            pa = await c.new_page()
            await pa.goto(URL); await pa.wait_for_selector('#codigo-acceso'); await revisar(pa, ancho, '1-activar')
            await pa.fill('#codigo-acceso', codigos[(ancho, 'cargar')]); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
            await revisar(pa, ancho, '2-inicio')
            await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Jóvenes")')
            for sel, val in [('#nombre', 'María de los Ángeles Fernández Gutiérrez'), ('#dni', '30111222'), ('#telefono', '3624111222'), ('#edad', '22')]:
                await pa.fill(sel, val)
            await pa.locator('[aria-label="¿Viaja en el transporte del evento?"] button:has-text("Sí")').click()
            await pa.locator('[aria-label="¿Tiene restricciones alimentarias?"] button:has-text("Sí")').click()
            await pa.fill('#restricciones_cuales', 'Celíaca, sin lactosa')
            await pa.locator('[aria-label="Medio de pago"] button:has-text("Transferencia")').click()
            await revisar(pa, ancho, '3-formulario')
            await pa.click('text=Revisar y cobrar'); await pa.wait_for_selector('text=Sí, guardar inscripción', timeout=5000) if await pa.locator('#banco').count() == 0 else None
            if await pa.locator('.con-error').count():
                await pa.fill('#banco', 'Mercado Pago'); await pa.fill('#ultimos6', 'A1B2C3'); await pa.click('text=Revisar y cobrar')
            await pa.wait_for_selector('text=Sí, guardar inscripción'); await revisar(pa, ancho, '4-confirmar')
            await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
            await pa.click('text=Inscripciones en este dispositivo') if await pa.locator('text=Inscripciones en este dispositivo').count() else await pa.click('.tarjeta-menu >> nth=0')
            await pa.wait_for_timeout(400); await revisar(pa, ancho, '5-lista'); await pa.click('text=Volver')
            await pa.click('text=Resumen para rendir'); await revisar(pa, ancho, '6-rendir'); await pa.click('text=Volver')
            await pa.click('text=¿Cómo se usa esta pantalla?'); await revisar(pa, ancho, '7-ayuda')
            await pa.goto(URL + '#ayuda'); await pa.wait_for_timeout(500); await revisar(pa, ancho, '8-que-hago-si')
            await c.close()
            c = await b.new_context(viewport={'width': ancho, 'height': 640}, is_mobile=True, has_touch=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
            await c.route(re.compile(r'supabase\.co/'), ruta)
            pp = await c.new_page()
            await pp.goto(URL); await pp.fill('#codigo-acceso', codigos[(ancho, 'puerta')]); await pp.click('text=Activar con el código')
            await pp.wait_for_selector('#buscar-puerta'); await pp.fill('#buscar-puerta', 'mar'); await pp.wait_for_timeout(400)
            await revisar(pp, ancho, '9-puerta')
            await c.close()
        await b.close()
    print('\n'.join(problemas) if problemas else 'Sin problemas de tamaño')
    print(f'Capturas en {OUT}')

asyncio.run(main())
