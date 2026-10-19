"""Simulacro, parte en el navegador: la puerta con 3.000 inscriptos (velocidad de búsqueda) y el Excel de 3.000 filas."""
import asyncio, os, sys, re, time, json, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pruebas-integradas'))
from e2e_real import ruta, ingresar, URL, jwt, proxy_rpc
from playwright.async_api import async_playwright

async def main():
    ahora = datetime.datetime.now(datetime.timezone.utc)
    st, b = proxy_rpc('panel_crear_acceso', json.dumps({'p_evento': 'congreso-prueba', 'p_nombre': 'Puerta Navegador', 'p_tarea': 'presentes',
        'p_desde': (ahora - datetime.timedelta(hours=1)).isoformat(), 'p_hasta': (ahora + datetime.timedelta(hours=4)).isoformat()}).encode(), 'Bearer ' + jwt('carlos@gmail.com'))
    codigo = json.loads(b)['codigo']
    async with async_playwright() as p:
        br = await p.chromium.launch()
        # Celular modesto: CPU 4 veces más lenta
        c = await br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR')
        await c.route(re.compile(r'supabase\.co/'), ruta)
        pg = await c.new_page()
        cdp = await c.new_cdp_session(pg); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await pg.goto(URL); await pg.fill('#codigo-acceso', codigo)
        t = time.perf_counter(); await pg.click('text=Activar con el código'); await pg.wait_for_selector('#buscar-puerta')
        await pg.wait_for_selector('.contador-puerta >> text=de 3000', timeout=60000)
        print(f'Puerta: activar y bajar 3.000 inscriptos: {time.perf_counter()-t:.1f} s')
        for q in ['go', 'gomez', 'ana go', '23', '3456']:
            t = time.perf_counter(); await pg.fill('#buscar-puerta', q)
            await pg.wait_for_function("() => document.querySelectorAll('.fila-puerta').length > 0 || document.querySelector('.advertencia')", timeout=10000)
            n = await pg.locator('.fila-puerta').count()
            print(f'  buscar «{q}»: {(time.perf_counter()-t)*1000:.0f} ms · {n} filas mostradas')
        # Excel desde el panel
        pc = await br.new_context(viewport={'width': 1200, 'height': 850}, locale='es-AR', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pp = await pc.new_page(); await ingresar(pp, 'carlos@gmail.com')
        await pp.select_option('.selector-evento select', 'congreso-prueba')
        t = time.perf_counter()
        async with pp.expect_download(timeout=120000) as d:
            await pp.click('text=Descargar Excel')
        dl = await d.value; await dl.save_as('/tmp/carga.xlsx')
        print(f'Excel de 3.000 inscripciones: {time.perf_counter()-t:.1f} s · {os.path.getsize("/tmp/carga.xlsx")/1024:.0f} KB')
        await br.close()
asyncio.run(main())
