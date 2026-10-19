"""Prueba integrada (Etapa 9): «Primeros pasos» del Responsable general y mensajes de error claros."""
import asyncio, os, sys, re, json
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_primeros'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)

async def main():
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1200, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')

        # 1) Recién instalado: la lista aparece y propone cargar la institución
        await pg.wait_for_selector('.primeros-pasos')
        texto = await pg.inner_text('.primeros-pasos')
        print('lista:', texto.replace('\n', ' | ')[:300])
        assert 'Cargar los datos de la institución' in texto
        assert await pg.locator('.paso-inicial.siguiente >> text=Cargar los datos de la institución').count() == 1
        await foto(pg, 'recien-instalado')

        # 2) El botón lleva a la sección y, al guardar, el paso queda hecho solo
        await pg.click('.primeros-pasos >> text=Cargar datos'); await pg.wait_for_selector('#inst-nombre')
        await pg.fill('#inst-nombre', 'Club de prueba'); await pg.click('.panel-form button:has-text("Guardar")')
        await pg.wait_for_selector('text=Guardado')
        await pg.click('nav >> text=Resumen')
        await pg.wait_for_selector('.paso-inicial.hecho >> text=Cargar los datos de la institución')
        assert await pg.locator('.paso-inicial.siguiente >> text=Dar de alta al equipo').count() == 1

        assert await pg.locator('.primeros-pasos').count() == 1
        # 3) Sin rol Organizador, los pasos del Organizador explican qué hacer
        await pg.click('.paso-titulo:has-text("Crear el primer evento")')
        cuerpo = await pg.inner_text('.paso-cuerpo')
        print('evento:', cuerpo.replace('\n', ' | '))
        await foto(pg, 'paso-desplegado')

        # 4) Dar el equipo (Organizador y Tesorero a uno mismo) marca el paso
        await pg.click('nav >> text=Personas y roles'); await pg.click('tr:has-text("carlos@gmail.com") >> text=Modificar')
        await pg.click('.rol-opcion:has-text("Organizador")'); await pg.click('.rol-opcion:has-text("Tesorero")')
        await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('tr:has-text("carlos@gmail.com") >> text=Tesorero')
        await pg.click('nav >> text=Resumen')
        await pg.wait_for_selector('.paso-inicial.hecho >> text=Dar de alta al equipo')

        # 5) Pasos manuales: «Ya lo hice» y se recuerda al recargar
        await pg.click('.paso-titulo:has-text("Guardar la hoja de accesos")')
        await pg.click('.paso-cuerpo >> text=Ya lo hice')
        await pg.reload(); await pg.wait_for_selector('.paso-inicial.hecho >> text=Guardar la hoja de accesos')
        hechos = await pg.inner_text('.primeros-cabecera')
        print('progreso:', hechos.replace('\n', ' '))
        await foto(pg, 'avance')

        # 5 bis) Ayuda de la pantalla
        await pg.click('text=¿Cómo se usa esta pantalla?'); await pg.wait_for_selector('.ayuda-cuerpo >> text=Efectivo pendiente de rendir')
        await foto(pg, 'ayuda-resumen', full=False)
        await pg.click('nav >> text=Rendiciones'); await pg.click('text=¿Cómo se usa esta pantalla?')
        await pg.wait_for_selector('.ayuda-cuerpo >> text=Registrar entrega')
        await pg.click('nav >> text=Resumen')

        # 6) Ocultar y volver a mostrar
        await pg.click('text=Ocultar esta lista'); await pg.wait_for_selector('.primeros-pasos', state='detached')
        await pg.click('text=Ver primeros pasos'); await pg.wait_for_selector('.primeros-pasos')

        # 7) Mensajes de error: base desactualizada (función inexistente) y error desconocido
        async def falta_funcion(route):
            await route.fulfill(status=404, content_type='application/json',
                                body=json.dumps({'code': 'PGRST202', 'message': 'Could not find the function public.panel_resumen'}))
        await pg.route(re.compile(r'rpc/panel_resumen'), falta_funcion)
        await pg.reload(); await pg.wait_for_selector('text=base de datos está desactualizada')
        await foto(pg, 'error-base-desactualizada', full=False)
        await pg.unroute(re.compile(r'rpc/panel_resumen'))

        async def codigo_raro(route):
            await route.fulfill(status=200, content_type='application/json', body='{"ok":false,"error":"algo_nuevo"}')
        await pg.route(re.compile(r'rpc/panel_resumen'), codigo_raro)
        await pg.reload(); await pg.wait_for_selector('text=código: algo_nuevo')
        await pg.unroute(re.compile(r'rpc/panel_resumen'))

        await b.close()
        print('errores de página:', errores)
        if errores: sys.exit(1)
        print('OK')

if __name__ == "__main__":
    asyncio.run(main())
