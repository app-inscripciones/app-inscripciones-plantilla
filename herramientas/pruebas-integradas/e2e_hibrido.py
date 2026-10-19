"""Prueba integrada (R18, D57): evento híbrido de punta a punta.
Asistente (modalidad híbrida, cupo 2 personas, cierre al 100 %, matrícula presencial $5.000 y virtual $2.000) →
celular: 2 presenciales llenan el cupo → se cierran solos → el celular solo ofrece «Virtual» → virtual a $2.000 →
panel con el cupo cerrado → puerta que espera solo a los presenciales → ampliar el cupo reabre → el celular vuelve a ofrecer «Presencial».
Correr después de e2e_real.py (que le da el rol Organizador a carlos@gmail.com) o con la base recién cargada."""
import asyncio, os, sys, re, subprocess, json
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_hibrido'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

def g(etiqueta): return f'[role=radiogroup][aria-label="{etiqueta}"]'

async def inscribir(pa, nombre, dni, modalidad, total):
    await pa.click('text=+ Nueva inscripción')
    await pa.fill('#nombre', nombre); await pa.fill('#dni', dni); await pa.fill('#telefono', '3624' + dni[-6:])
    await pa.locator(g('¿Cómo va a participar?') + f' button:has-text("{modalidad}")').click()
    await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
    await pa.click('text=Revisar y cobrar'); await pa.wait_for_selector(f'text={total}')
    await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
    for _ in range(40):
        if sql(f"select count(*) from inscripciones where datos ->> 'dni' = '{dni}'") == '1': return
        await pa.wait_for_timeout(500)
    raise AssertionError(f'no llegó {nombre}')

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, 'organizador' from public.usuarios where email = 'carlos@gmail.com' on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        # ---- Asistente
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-evento')
        await pg.fill('#ev-nombre', 'Congreso híbrido'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', '2027-03-20'); await pg.click('#siguiente')
        await pg.wait_for_selector('#ev-persona'); await pg.click('#siguiente')
        await pg.click('#mod-hibrido'); await pg.fill('#cupo-presencial', '2')
        await pg.click('button:has-text("Cerrar sola al 100 %")'); await foto(pg, 'paso-modalidad')
        await pg.click('#siguiente')                                   # categorías
        await pg.click('#siguiente')                                   # datos
        await pg.wait_for_selector('text=«¿Cómo va a participar?»'); await foto(pg, 'paso-datos')
        await pg.click('#siguiente')                                   # cobro
        c1 = pg.locator('.concepto').first
        await c1.locator('input[aria-label="Nombre del concepto"]').fill('Matrícula presencial')
        await c1.locator('select').select_option(label='Solo si en «¿Cómo va a participar?» elige «Presencial»')
        await c1.locator('input[aria-label="Precio Precio"]').fill('5000')
        await pg.click('text=+ Agregar otro cobro')
        c2 = pg.locator('.concepto').nth(1)
        await c2.locator('input[aria-label="Nombre del concepto"]').fill('Matrícula virtual')
        await c2.locator('select').select_option(label='Solo si en «¿Cómo va a participar?» elige «Virtual»')
        await c2.locator('input[aria-label="Precio Precio"]').fill('2000')
        await foto(pg, 'paso-cobro'); await pg.click('#siguiente')    # asistencia
        await pg.click('#siguiente')                                   # resumen
        await pg.wait_for_selector('.resumen-simple'); texto = await pg.inner_text('.resumen-simple'); print(texto)
        assert '2 lugares presenciales' in texto, texto
        await foto(pg, 'resumen')
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        ev = sql("select id from eventos where nombre = 'Congreso híbrido'")
        # ---- QR
        await pg.click('text=Generar QR de colaboradores')
        await pg.wait_for_selector('h2:has-text("Congreso híbrido")')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Cargadora Híbrida'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_carga = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        await pg.click('text=+ QR de control de presentes'); await pg.fill('#nombre-colaborador', 'Puerta Híbrida'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_puerta = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        # ---- Celular: 2 presenciales llenan el cupo
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', c_carga); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        await inscribir(pa, 'Ana Presencial', '30111001', 'Presencial', '$ 5.000')
        await inscribir(pa, 'Beto Presencial', '30111002', 'Presencial', '$ 5.000')
        assert sql(f"select presenciales_cerradas_por from eventos where id = '{ev}'").startswith('automático'), 'no se cerró solo'
        await pa.reload(); await pa.wait_for_selector('text=+ Nueva inscripción'); await pa.wait_for_timeout(1500)
        await pa.click('text=+ Nueva inscripción'); await pa.wait_for_selector('text=Los lugares presenciales están completos')
        boton = pa.locator(g('¿Cómo va a participar?') + ' button:has-text("Presencial")')
        assert await boton.is_disabled(), 'Presencial sigue habilitado'
        await foto(pa, 'celular-completo', full=False)
        await pa.click('text=Cancelar')
        await inscribir(pa, 'Ceci Virtual', '30111003', 'Virtual', '$ 2.000')
        # ---- Panel
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', ev)
        await pg.wait_for_selector('.cupo-presencial.cerrado'); await foto(pg, 'panel-cerrado')
        # ---- Puerta: espera solo a los 2 presenciales
        pp = await celular(b); pp.on('pageerror', lambda e: errores.append(str(e)))
        await pp.goto(URL); await pp.fill('#codigo-acceso', c_puerta); await pp.click('text=Activar con el código')
        await pp.wait_for_selector('text=de 2'); await pp.fill('#buscar-puerta', 'ceci')
        assert await pp.locator('button:has-text("Presente")').count() == 0, 'la virtual aparece en la puerta'
        await foto(pp, 'puerta', full=False)
        # ---- Ampliar el cupo reabre
        await pg.click('text=Cambiar el cupo'); await pg.fill('#nuevo-cupo', '3'); await pg.click('.cupo-presencial >> text=Guardar')
        await pg.wait_for_selector('text=Cerrar los lugares presenciales')
        await foto(pg, 'panel-ampliado')
        assert sql(f"select presenciales_cerradas_en is null from eventos where id = '{ev}'") == 't'
        await pa.reload(); await pa.wait_for_selector('text=+ Nueva inscripción'); await pa.wait_for_timeout(1500)
        await pa.click('text=+ Nueva inscripción')
        assert not await pa.locator(g('¿Cómo va a participar?') + ' button:has-text("Presencial")').is_disabled(), 'no se reabrió en el celular'
        print('montos:', sql(f"select string_agg(datos ->> 'modalidad' || ' ' || monto || ' ' || monto_revisar, ', ' order by numero_orden) from inscripciones where evento_id = '{ev}'"))
        await b.close()
    assert not errores, errores
    print('OK: evento híbrido de punta a punta')

asyncio.run(main())
