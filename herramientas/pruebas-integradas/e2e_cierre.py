"""Prueba integrada: D46 cerrar/reabrir inscripciones y D45 evento sin cobro."""
import asyncio, os, sys, re, subprocess, time
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_cierre'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def crear_qr(pg, evento_nombre, persona, tarea='+ QR de cargador'):
    await pg.click('nav >> text=QR de colaboradores')
    await pg.wait_for_selector(f'button.opcion:has-text("{evento_nombre}")'); await pg.click(f'button.opcion:has-text("{evento_nombre}")')
    await pg.click(f'text={tarea}'); await pg.fill('#nombre-colaborador', persona); await pg.click('text=Crear QR')
    await pg.wait_for_selector('.qr-codigo'); c = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo'); return c

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

async def main():
    sql("update public.eventos set inscripciones_cerradas_en = null where id = 'congreso-prueba'; "
        "delete from public.inscripciones where evento_id like 'jornada-gratuita%'; "
        "delete from public.sesiones where acceso_id in (select id from public.accesos where evento_id like 'jornada-gratuita%'); "
        "delete from public.accesos where evento_id like 'jornada-gratuita%'; delete from public.eventos where id like 'jornada-gratuita%'")
    sufijo = time.strftime('%H%M%S')
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        codigo = await crear_qr(pg, 'Congreso de prueba', f'Cargadora Cierre {sufijo}')
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        # cerrar
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', 'congreso-prueba')
        await pg.wait_for_selector('text=Inscripciones abiertas'); await pg.click('text=Cerrar las inscripciones')
        await pg.fill('#motivo-cierre', 'cupo completo'); await foto(pg, 'confirmar-cierre')
        await pg.click('#confirmar-cierre'); await pg.wait_for_selector('.cierre-inscripciones.cerradas'); await foto(pg, 'cerradas')
        await pg.click('nav >> text=QR de colaboradores'); await pg.click('button.opcion:has-text("Congreso de prueba")')
        assert await pg.locator('button:has-text("+ QR de cargador")').is_disabled(); await foto(pg, 'qr-cerradas')
        await pa.reload(); await pa.wait_for_selector('text=El organizador cerró las inscripciones del evento'); await foto(pa, 'celular-cerradas', full=False)
        # reabrir
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', 'congreso-prueba')
        await pg.click('text=Volver a abrir las inscripciones'); await pg.click('#confirmar-cierre'); await pg.wait_for_selector('text=Inscripciones abiertas')
        await pa.reload(); await pa.wait_for_selector('text=+ Nueva inscripción')
        print('auditoría:', sql("select string_agg(accion, ',' order by id) from public.auditoria where accion like '%inscripciones' and cuando > now() - interval '5 minutes'"))
        # evento sin cobro con el asistente
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-evento')
        await pg.fill('#ev-nombre', 'Jornada gratuita'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', '2027-04-10'); await pg.click('#siguiente')
        await pg.click('#siguiente'); await pg.click('#siguiente'); await pg.click('#siguiente'); await pg.click('#siguiente')
        try:
            await pg.click('#cobro-no', timeout=8000)
        except Exception:
            await foto(pg, 'FALLA'); print(await pg.inner_text('main')); raise
        await foto(pg, 'cobro-gratis'); await pg.click('#siguiente')
        await pg.click('#siguiente'); await pg.wait_for_selector('.resumen-simple')
        assert 'evento gratuito' in await pg.inner_text('.resumen-simple')
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        codigo2 = await crear_qr(pg, 'Jornada gratuita', f'Cargador Gratis {sufijo}')
        pb = await celular(b); pb.on('pageerror', lambda e: errores.append(str(e)))
        await pb.goto(URL); await pb.fill('#codigo-acceso', codigo2); await pb.click('text=Activar con el código'); await pb.wait_for_selector('text=+ Nueva inscripción')
        await pb.click('text=+ Nueva inscripción')
        for sel, val in [('#nombre', 'Lucía Gratis'), ('#dni', '33444555'), ('#telefono', '3624777888')]: await pb.fill(sel, val)
        await foto(pb, 'formulario-gratis', full=True)
        assert await pb.locator('text=Medio de pago').count() == 0
        await pb.click('button:has-text("Revisar")'); await pb.click('text=Sí, guardar inscripción'); await pb.wait_for_selector('text=Inscripción guardada')
        r = ''
        for _ in range(30):
            r = sql("select medio_pago || '|' || monto from public.inscripciones where evento_id like 'jornada-gratuita%'")
            if r: break
            await pb.wait_for_timeout(500)
        print('gratis en la base:', r); assert r == 'sin_cobro|0'
        print('errores:', errores); await b.close()
        if errores: sys.exit(1)

asyncio.run(main())
