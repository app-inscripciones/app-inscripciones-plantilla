"""Prueba integrada (R20, D62): autopresente con QR de punta a punta.
Asistente (evento por persona, «¿Los participantes pueden marcar su propio presente con un QR?» → Sí) → dos inscripciones
desde el celular → panel: QR de autopresente impreso (cartel) → celular del participante: DNI → «¿Sos Ana P.?» → presente →
la puerta lo ve como «Se anotó solo» → QR en pantalla: la pantalla muestra el QR; una foto vieja (solo el código fijo) no sirve;
el código de la pantalla sí → panel con «se anotaron solos». Correr con la base recién cargada (con 019)."""
import asyncio, os, sys, re, subprocess, json, datetime
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_autopresente'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

async def inscribir(pa, nombre, dni):
    await pa.click('text=+ Nueva inscripción')
    await pa.fill('#nombre', nombre); await pa.fill('#dni', dni); await pa.fill('#telefono', '3624' + dni[-6:])
    await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
    await pa.click('text=Revisar y cobrar'); await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
    for _ in range(40):
        if sql(f"select count(*) from inscripciones where datos ->> 'dni' = '{dni}'") == '1': return
        await pa.wait_for_timeout(500)
    raise AssertionError(f'no llegó {nombre}')

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, 'organizador' from public.usuarios where email = 'carlos@gmail.com' on conflict do nothing")
    hoy = datetime.date.today().isoformat()
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        # ---- Asistente
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-evento')
        await pg.fill('#ev-nombre', 'Culto especial'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', hoy); await pg.click('#siguiente')
        await pg.wait_for_selector('#ev-persona'); await pg.click('#siguiente')
        await pg.wait_for_selector('#mod-presencial'); await pg.click('#siguiente')
        await pg.wait_for_selector('#cat-si'); await pg.click('#siguiente')
        await pg.wait_for_selector('text=Datos frecuentes'); await pg.click('#siguiente')
        await pg.locator('.concepto input[aria-label="Precio Precio"]').fill('1000'); await pg.click('#siguiente')
        await pg.wait_for_selector('#auto-si'); await pg.click('#auto-si'); await foto(pg, 'paso-asistencia')
        await pg.click('#siguiente')
        await pg.wait_for_selector('.resumen-simple'); texto = await pg.inner_text('.resumen-simple')
        assert 'marcar su presente escaneando un QR' in texto, texto
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        ev = sql("select id from eventos where nombre = 'Culto especial'")
        assert sql(f"select definicion -> 'asistencia' ->> 'autopresente' from eventos where id = '{ev}'") == 'true'
        # ---- QR de cargador y de puerta
        await pg.click('text=Generar QR de colaboradores'); await pg.wait_for_selector('h2:has-text("Culto especial")')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Cargador Culto'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_carga = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        await pg.click('text=+ QR de control de presentes'); await pg.fill('#nombre-colaborador', 'Puerta Culto'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_puerta = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', c_carga); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        await inscribir(pa, 'Ana María Pérez', '30111222')
        await inscribir(pa, 'Beto Gómez', '30111333')
        # ---- QR de autopresente impreso
        await pg.wait_for_selector('#nuevo-autopresente'); await pg.click('#nuevo-autopresente')
        await pg.click('#auto-impreso'); await foto(pg, 'form-autopresente')
        await pg.click('#crear-autopresente'); await pg.wait_for_selector('.cartel-autopresente img')
        await foto(pg, 'cartel')
        codigo = sql(f"select codigo from autopresentes where evento_id = '{ev}' and modo = 'impreso'")
        # ---- Participante
        pp = await celular(b); pp.on('pageerror', lambda e: errores.append(str(e)))
        await pp.goto(URL + '#autopresente/' + codigo); await pp.wait_for_selector('#dato-autopresente')
        await foto(pp, 'participante-inicio', full=False)
        await pp.fill('#dato-autopresente', '99999999'); await pp.click('button:has-text("Buscar")')
        await pp.wait_for_selector('text=No te encontramos')
        await pp.fill('#dato-autopresente', '30111222'); await pp.click('button:has-text("Buscar")')
        await pp.wait_for_selector('text=¿Sos Ana M. P.?'); await foto(pp, 'participante-sos', full=False)
        cuerpo = await pp.inner_text('main')
        assert 'Pérez' not in cuerpo and 'Beto' not in cuerpo, cuerpo
        await pp.click('#confirmar-presente'); await pp.wait_for_selector('text=¡Listo! Quedaste presente')
        await foto(pp, 'participante-listo', full=False)
        assert sql(f"select marcado_por || ' ' || origen from asistencias where evento_id = '{ev}' and estado = 'presente'") == 'Se anotó solo autopresente'
        # ---- La puerta lo ve
        pu = await celular(b); pu.on('pageerror', lambda e: errores.append(str(e)))
        await pu.goto(URL); await pu.fill('#codigo-acceso', c_puerta); await pu.click('text=Activar con el código')
        await pu.wait_for_selector('text=de 2'); await pu.fill('#buscar-puerta', 'ana')
        await pu.wait_for_selector('.estado-puerta:has-text("Se anotó solo")'); await foto(pu, 'puerta', full=False)
        # ---- QR en pantalla
        await pg.click('text=Listo'); await pg.click('#nuevo-autopresente'); await pg.click('#auto-pantalla'); await pg.click('#crear-autopresente')
        await pg.wait_for_selector('#abrir-pantalla'); await foto(pg, 'pantalla-creada')
        enlace = await pg.get_attribute('#abrir-pantalla', 'href')
        pt = await (await b.new_context(viewport={'width': 1280, 'height': 900}, locale='es-AR')).new_page()
        await pt.context.route(re.compile(r'supabase\.co/'), ruta)
        await pt.goto(enlace); await pt.wait_for_selector('.pantalla-qr'); await foto(pt, 'pantalla', full=False)
        base = sql(f"select codigo from autopresentes where evento_id = '{ev}' and modo = 'pantalla'")
        pantalla = sql(f"select pantalla from autopresentes where evento_id = '{ev}' and modo = 'pantalla'")
        await pp.goto(URL + '#autopresente/' + base); await pp.reload()
        await pp.wait_for_selector('text=Este QR ya cambió')             # una foto vieja no sirve
        actual = json.loads(sql(f"select public.autopresente_pantalla('{pantalla}')"))['codigo']
        await pp.goto(URL + '#autopresente/' + actual); await pp.reload()
        await pp.fill('#dato-autopresente', '3624111333'); await pp.click('button:has-text("Buscar")')
        await pp.wait_for_selector('text=¿Sos Beto G.?'); await pp.click('#confirmar-presente'); await pp.wait_for_selector('text=¡Listo! Quedaste presente')
        # ---- Panel
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', ev)
        await pg.wait_for_selector('text=2 se anotaron solos con el QR'); await foto(pg, 'panel')
        await b.close()
    assert not errores, errores
    print('OK: autopresente con QR de punta a punta')

asyncio.run(main())
