"""Prueba integrada (D60): rendición del efectivo y de los tickets de la terminal.
Cargadora con 2 cobros con terminal y 1 en efectivo → su «Resumen para rendir» pide el efectivo y 2 tickets, con la lista →
el Tesorero ve «Faltan tickets: 2», registra la entrega (efectivo + 2 tickets) → no falta nada; el Excel suma los tickets.
Correr con la base recién cargada (con 017)."""
import asyncio, os, sys, re, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_tickets'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()
g = lambda l: f'[role=radiogroup][aria-label="{l}"]'

async def inscribir(pa, nombre, dni, medio):
    await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Adultos")')
    for sel, val in [('#nombre', nombre), ('#dni', dni), ('#telefono', '3624' + dni[-6:]), ('#edad', '40')]:
        await pa.fill(sel, val)
    await pa.locator(g('¿Viaja en el transporte del evento?') + ' button:has-text("No")').click()
    await pa.locator(g('¿Tiene restricciones alimentarias?') + ' button:has-text("No")').click()
    await pa.locator(f'[aria-label="Medio de pago"] button:has-text("{medio}")').click()
    await pa.click('text=Revisar y cobrar'); await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, r from public.usuarios, unnest(array['organizador','tesorero']) r where email = 'carlos@gmail.com' on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-practica'); await pg.wait_for_selector('text=está abierto')
        ev = sql('select id from eventos where practica')
        await pg.click('text=Generar QR de colaboradores'); await pg.wait_for_selector('.aviso-practica')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Tere Terminal'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); codigo = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        pa = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pa.route(re.compile(r'supabase\.co/'), ruta); pa = await pa.new_page(); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        await inscribir(pa, 'Ana Terminal', '30200001', 'Terminal con ticket')
        await inscribir(pa, 'Beto Terminal', '30200002', 'Terminal con ticket')
        await inscribir(pa, 'Ceci Efectivo', '30200003', 'Efectivo')
        for _ in range(40):
            if sql(f"select count(*) from inscripciones where evento_id = '{ev}'") == '3': break
            await pa.wait_for_timeout(500)
        # Celular: qué entregar
        await pa.click('text=Resumen para rendir'); await pa.wait_for_selector('text=Tickets en papel de la terminal')
        texto = await pa.inner_text('main')
        assert '2 tickets' in texto and 'Ana Terminal' in texto and 'Beto Terminal' in texto, texto
        await foto(pa, 'celular-resumen-para-rendir')
        # Panel: el Tesorero ve los tickets pendientes y registra la entrega
        await pg.click('nav >> text=Rendiciones'); await pg.select_option('.selector-evento select', ev)
        fila = pg.locator('tr:has-text("Tere Terminal")'); await fila.wait_for()
        assert '2' in await fila.locator('td').nth(5).inner_text()
        await foto(pg, 'rendiciones-faltan-tickets')
        await fila.locator('text=Registrar entrega').click()
        assert await pg.input_value('#tickets-rendicion') == '2'
        await foto(pg, 'registrar-con-tickets')
        await pg.click('button:has-text("Registrar $")'); await pg.wait_for_selector('text=Rendición registrada')
        aviso = await pg.inner_text('.exito'); print(aviso)
        assert '2 tickets de terminal' in aviso
        await foto(pg, 'rendicion-registrada')
        assert sql(f"select sum(tickets) || '|' || sum(monto) from rendiciones where evento_id = '{ev}'") == '2|4000', sql(f"select sum(tickets), sum(monto) from rendiciones where evento_id = '{ev}'")
        async with pg.expect_download() as d:
            await pg.click('text=Descargar Excel')
        print('Excel:', (await d.value).suggested_filename)
        await b.close()
    assert not errores, errores
    print('OK: rendición de efectivo y tickets')

asyncio.run(main())
