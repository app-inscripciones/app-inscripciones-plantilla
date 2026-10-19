"""Prueba integrada: datos de la institución (D35) y momentos de asistencia (D32)."""
import asyncio, os, sys, re
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_config'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=False):
    n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)

async def main():
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1200, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        await pg.wait_for_selector('.primeros-pasos >> text=Cargar los datos de la institución'); await foto(pg, 'aviso')
        await pg.click('.primeros-pasos >> text=Cargar datos'); await pg.wait_for_selector('#inst-nombre')
        await pg.fill('#inst-nombre', 'Club Atlético Las Palmas')
        await pg.fill('#inst-app', 'Inscripciones')
        await pg.locator('input[type=color]').nth(0).fill('#7a1f3d')
        await pg.locator('input[type=file]').set_input_files(os.path.join(DIR, 'logo.png'))
        await pg.wait_for_selector('.logo-previa'); await foto(pg, 'institucion-form', full=True)
        await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('text=Guardado')
        color = await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--principal').trim()")
        print('color aplicado:', color); assert color.upper() == '#7A1F3D'
        assert 'Club Atlético Las Palmas' in await pg.inner_text('header')
        # un celular nuevo toma los datos de la base
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR')
        await c.route(re.compile(r'supabase\.co/'), ruta)
        pc2 = await c.new_page(); await pc2.goto(URL); await pc2.wait_for_selector('header >> text=Club Atlético Las Palmas', timeout=15000)
        await pc2.wait_for_selector('.marca-logo'); await foto(pc2, 'celular-con-marca')
        # momentos de asistencia
        await pg.click('nav >> text=Personas y roles'); await pg.click('tr:has-text("carlos@gmail.com") >> text=Modificar')
        await pg.click('.rol-opcion:has-text("Organizador")'); await pg.click('button:has-text("Guardar")')
        await pg.wait_for_selector('tr:has-text("carlos@gmail.com") >> text=Organizador'); await pg.reload()
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', 'congreso-prueba')
        await pg.click('text=Editar momentos de asistencia')
        await pg.click('text=+ Agregar momento')
        await pg.locator('.fila-momento').nth(1).locator('input[aria-label=Nombre]').fill('Cena del sábado')
        await pg.locator('.fila-momento').nth(1).locator('select').select_option('noche')
        await foto(pg, 'momentos')
        await pg.click('.panel-form >> button:has-text("Guardar")'); await pg.wait_for_selector('td:has-text("Cena del sábado")')
        await foto(pg, 'momentos-guardados')
        print('errores:', errores); await b.close()
        if errores: sys.exit(1)

asyncio.run(main())
