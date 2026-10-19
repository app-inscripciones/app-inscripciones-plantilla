"""Prueba integrada (Etapa 9): la guía «¿Qué hago si…?» en el celular, también sin internet."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import URL
from playwright.async_api import async_playwright

OUT = os.path.join(os.path.dirname(__file__), 'img_ayuda'); os.makedirs(OUT, exist_ok=True)

async def main():
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR')
        pg = await c.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('text=¿Problemas?')
        await pg.screenshot(path=f'{OUT}/01-activar.png', full_page=True)
        await pg.click('text=¿Problemas?'); await pg.wait_for_selector('h1:has-text("¿Qué hago si…?")')
        await pg.screenshot(path=f'{OUT}/02-guia.png', full_page=False)
        await pg.click('summary:has-text("El QR no se activa")'); await pg.wait_for_selector('text=código corto que está debajo del QR')
        await pg.fill('#buscar-ayuda', 'efectivo'); await pg.wait_for_timeout(200)
        n = await pg.locator('details.caso').count(); print('casos con «efectivo»:', n); assert 1 <= n <= 5
        await pg.screenshot(path=f'{OUT}/03-busqueda.png', full_page=True)
        await pg.click('text=← Volver'); await pg.wait_for_selector('text=¿Problemas?')
        # sin internet (la app ya quedó instalada en el navegador)
        await pg.wait_for_timeout(1500); await c.set_offline(True)
        await pg.goto(URL + '#ayuda'); await pg.wait_for_selector('h1:has-text("¿Qué hago si…?")')
        print('sin internet: la guía abre')
        await b.close()
        print('errores:', errores)
        if errores: sys.exit(1)
        print('OK')

if __name__ == '__main__':
    asyncio.run(main())
