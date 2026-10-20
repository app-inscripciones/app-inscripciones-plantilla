"""Prueba integrada (D77): un QR de cargador con VARIOS eventos, de punta a punta.
Panel: el Organizador crea el QR del evento A y tilda B y C → la tarjeta nombra los tres → la lista de QR de B también lo muestra.
Celular: activa una vez → «+ Nueva inscripción» pregunta «¿Para qué evento?» → inscribe en B y en C → cada una queda en su evento
→ el resumen para rendir separa el efectivo por evento → si B cierra las inscripciones, B aparece deshabilitado y A sigue.
Base: la del video (init.sql de los manuales, con 023) y un evento por persona con precio por categoría y edad.
Uso: DB=video python3 e2e_varios_eventos.py"""
import asyncio, os, sys, re, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_varios'); os.makedirs(OUT, exist_ok=True)
BASE = os.environ.get('DB', 'video')
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', BASE, '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def inscribir(pa, evento, nombre, dni):
    await pa.click('text=+ Nueva inscripción'); await pa.wait_for_selector('text=¿Para qué evento es la inscripción?')
    await pa.click(f'.elegir-evento:has-text("{evento}")')
    await pa.click('button:has-text("Adultos")')
    for sel, val in [('#nombre', nombre), ('#dni', dni), ('#telefono', '3624000111'), ('#edad', '40')]:
        await pa.fill(sel, val)
    await pa.locator('[role=radiogroup][aria-label="¿Tiene restricciones alimentarias?"] button:has-text("No")').click()
    await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
    await pa.click('text=Revisar y cobrar'); await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')

async def main():
    base = sql("select id from eventos where not practica and unidad = 'persona' and id not like 'camp-%' order by fecha desc limit 1")
    sql("delete from inscripciones where evento_id like 'camp-%'; delete from acceso_eventos where evento_id like 'camp-%'; "
        "delete from sesiones where acceso_id in (select id from accesos where evento_id like 'camp-%'); delete from accesos where evento_id like 'camp-%'; "
        "delete from eventos where id like 'camp-%'")
    sql(f"insert into eventos (id, nombre, fecha, unidad, estado, es_modelo, definicion) select 'camp-' || x, 'Campamento ' || upper(x), current_date + n * 14, unidad, 'abierto', false, definicion "
        f"from eventos, (values ('a', 1), ('b', 2), ('c', 3)) v(x, n) where id = '{base}'")
    sql("insert into practicas_hechas (correo, paso) select 'carlos@gmail.com', unnest(array['crear','qr','inscripcion','presente','rendicion']) on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        await pg.click('nav >> text=QR de colaboradores'); await pg.wait_for_selector('text=+ QR de cargador')
        await pg.click('.opcion:has-text("Campamento A")')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Ana Pérez')
        await pg.wait_for_selector('.otros-eventos'); await foto(pg, 'form-varios')
        await pg.check('.otros-eventos label:has-text("Campamento B") input'); await pg.check('.otros-eventos label:has-text("Campamento C") input')
        await foto(pg, 'form-tildados')
        await pg.click('text=Crear QR'); await pg.wait_for_selector('.qr-codigo')
        tarjeta = await pg.inner_text('.hoja-qr'); print('tarjeta:', tarjeta.replace('\n', ' | '))
        assert 'Campamento A · Campamento B · Campamento C' in tarjeta, tarjeta
        codigo = (await pg.inner_text('.qr-codigo')).strip(); await foto(pg, 'tarjeta')
        await pg.click('text=Listo')
        await pg.click('.opcion:has-text("Campamento B")'); await pg.wait_for_selector('text=Eventos de este QR')
        await foto(pg, 'lista-qr-b')

        pa_ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pa_ctx.route(re.compile(r'supabase\.co/'), ruta)
        pa = await pa_ctx.new_page(); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código')
        await pa.wait_for_selector('text=+ Nueva inscripción')
        cerrar_aviso = pa.locator('button:has-text("Entendido")')
        if await cerrar_aviso.count(): await cerrar_aviso.first.click()
        await foto(pa, 'celular-inicio', full=False)
        await pa.click('text=+ Nueva inscripción'); await pa.wait_for_selector('.elegir-evento'); await foto(pa, 'elegir-evento', full=False)
        await pa.click('text=Volver')
        await inscribir(pa, 'Campamento B', 'Laura Díaz', '35111222')
        await inscribir(pa, 'Campamento C', 'Mario Sosa', '20111222')
        r = ''
        for _ in range(40):
            r = sql("select string_agg(evento_id || ':' || (datos->>'nombre') || ':' || monto, ',' order by evento_id) from inscripciones where evento_id like 'camp-%'")
            if r and r.count(':') == 4: break
            await pa.wait_for_timeout(500)
        print('en la base:', r)
        assert r == 'camp-b:Laura Díaz:12000,camp-c:Mario Sosa:12000', r
        await pa.click('text=Resumen para rendir'); await pa.wait_for_selector('.resumen-evento')
        textos = await pa.locator('.resumen-evento').all_inner_texts()
        assert len(textos) == 3 and '12.000' in textos[1] and '12.000' in textos[2], textos
        await foto(pa, 'resumen-por-evento')
        await pa.click('text=Volver')

        # B cierra las inscripciones: el celular lo muestra deshabilitado y sigue con A y C.
        sql("update eventos set inscripciones_cerradas_en = now() where id = 'camp-b'")
        await pa.reload(); await pa.wait_for_selector('text=+ Nueva inscripción')
        for _ in range(20):
            await pa.click('text=+ Nueva inscripción'); await pa.wait_for_selector('.elegir-evento')
            if await pa.locator('.elegir-evento:has-text("Campamento B")').is_disabled(): break
            await pa.click('text=Volver'); await pa.wait_for_timeout(1000)
        assert await pa.locator('.elegir-evento:has-text("Campamento B")').is_disabled()
        assert not await pa.locator('.elegir-evento:has-text("Campamento A")').is_disabled()
        await foto(pa, 'b-cerrado', full=False)
        await b.close()
    print('errores de la app:', errores)
    assert not errores
    print('OK: un QR con varios eventos funciona de punta a punta')

asyncio.run(main())
