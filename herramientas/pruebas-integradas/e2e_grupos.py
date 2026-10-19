"""Prueba integrada (R19, D61): inscripción por grupo de punta a punta.
Asistente (familias de 2 a 4, según cada integrante: Niños $2.000 / Adultos $5.000 + transporte $1.000 a cada uno,
edad de cada integrante, asistencia por integrante) → celular: familia de 3 con un integrante agregado → $ 15.000 →
panel (familias y personas, detalle con integrantes, corrección de un nombre, agregar alguien que cambia el monto: no) →
puerta (busca por el nombre de un integrante y lo marca solo a él) → Excel con la hoja «Integrantes».
Correr con la base recién cargada (con 018)."""
import asyncio, os, sys, re, subprocess, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_grupos'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

def g(etiqueta): return f'[role=radiogroup][aria-label="{etiqueta}"]'

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, 'organizador' from public.usuarios where email = 'carlos@gmail.com' on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        # ---- Asistente
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-evento')
        await pg.fill('#ev-nombre', 'Retiro de familias'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', '2027-04-10'); await pg.click('#siguiente')
        await pg.click('#ev-grupo'); await pg.wait_for_selector('#grupo-nombre')
        await pg.click('.panel-form button:has-text("familia")')
        await pg.fill('#grupo-min', '2'); await pg.fill('#grupo-max', '4'); await pg.click('#cobro-por-integrante')
        await foto(pg, 'paso-inscripcion')
        await pg.click('#siguiente'); await pg.wait_for_selector('#mod-presencial')   # modalidad
        await pg.click('#siguiente'); await pg.wait_for_selector('#cat-si')           # categorías
        await pg.click('#cat-si')
        await pg.click('text=+ Agregar categoría'); await pg.click('text=+ Agregar categoría')
        cats = pg.locator('.fila-categoria')
        await cats.nth(0).locator('[aria-label="Nombre de la categoría"]').fill('Niños')
        await cats.nth(0).locator('[aria-label="Edad desde"]').fill('0'); await cats.nth(0).locator('[aria-label="Edad hasta"]').fill('12')
        await cats.nth(1).locator('[aria-label="Nombre de la categoría"]').fill('Adultos')
        await cats.nth(1).locator('[aria-label="Edad desde"]').fill('13'); await cats.nth(1).locator('[aria-label="Edad hasta"]').fill('120')
        await pg.click('#siguiente'); await pg.wait_for_selector('[aria-label="Edad"]')   # datos
        await pg.check('[aria-label="Edad"]'); await pg.check('[aria-label="Si viaja en el transporte del evento"]')
        # El transporte se pregunta una vez por familia (ya viene así); la edad, a cada integrante.
        await foto(pg, 'paso-datos')
        await pg.click('#siguiente')                                   # cobro
        c1 = pg.locator('.concepto').first
        await c1.locator('button:has-text("Precio según la categoría")').click()
        await c1.locator('input[aria-label="Precio Niños"]').fill('2000'); await c1.locator('input[aria-label="Precio Adultos"]').fill('5000')
        await pg.click('text=+ Agregar otro cobro')
        c2 = pg.locator('.concepto').nth(1)
        await c2.locator('input[aria-label="Nombre del concepto"]').fill('Transporte')
        await c2.locator('select').select_option(label='Solo si en «¿Viaja en el transporte del evento?» responde «Sí»')
        await c2.locator('input[aria-label="Precio Precio"]').fill('1000')
        await foto(pg, 'paso-cobro'); await pg.click('#siguiente')    # asistencia
        await pg.click('#as-individual'); await foto(pg, 'paso-asistencia')
        await pg.click('#siguiente')                                   # resumen
        await pg.wait_for_selector('.resumen-simple'); texto = await pg.inner_text('.resumen-simple'); print(texto)
        assert 'cada inscripción es una familia de 2 a 4 personas' in texto, texto
        assert 'De cada integrante se pide: Nombre y apellido · DNI · Edad' in texto, texto
        assert 'se marca a cada integrante por separado' in texto, texto
        await foto(pg, 'resumen')
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        ev = sql("select id from eventos where nombre = 'Retiro de familias'")
        assert sql(f"select unidad || ' ' || (definicion -> 'grupo')::text from eventos where id = '{ev}'") == 'grupo {"max": 4, "min": 2, "cobro": "integrante", "nombre": "familia"}'
        # ---- QR
        await pg.click('text=Generar QR de colaboradores')
        await pg.wait_for_selector('h2:has-text("Retiro de familias")')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Cargadora Familias'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_carga = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        await pg.click('text=+ QR de control de presentes'); await pg.fill('#nombre-colaborador', 'Puerta Familias'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c_puerta = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        # ---- Celular: una familia de 3
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', c_carga); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        await pa.click('text=+ Nueva inscripción'); await pa.wait_for_selector('#i1-nombre')
        assert await pa.locator('.integrante').count() == 2, 'empieza con el mínimo de integrantes'
        await pa.fill('#nombre_grupo', 'Pérez'); await pa.fill('#telefono', '3624111222')
        await pa.locator(g('¿Viaja en el transporte del evento?') + ' button:has-text("Sí")').click()
        await pa.fill('#i1-nombre', 'Ana Pérez'); await pa.fill('#i1-dni', '30111222'); await pa.fill('#i1-edad', '40')
        await pa.locator(g('Categoría del integrante 1') + ' button:has-text("Adultos")').click()
        await pa.fill('#i2-nombre', 'Lola Pérez'); await pa.fill('#i2-dni', '50111222'); await pa.fill('#i2-edad', '7')
        await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
        await pa.click('text=Revisar y cobrar')                     # falta la categoría de Lola
        await pa.wait_for_selector('.integrante >> text=Elegí la categoría.')
        await pa.locator(g('Categoría del integrante 2') + ' button:has-text("Niños")').click()
        await pa.click('#agregar-integrante')
        await pa.fill('#i3-nombre', 'Juan Pérez'); await pa.fill('#i3-dni', '30111223'); await pa.fill('#i3-edad', '38')
        await pa.locator(g('Categoría del integrante 3') + ' button:has-text("Adultos")').click()
        await foto(pa, 'celular-formulario')
        tot = (await pa.inner_text('.barra-inferior')).replace('\xa0', ' ')
        assert '$ 15.000' in tot and 'Matrícula × 3' in tot and 'Transporte × 3' in tot, tot
        await pa.click('text=Revisar y cobrar'); await pa.wait_for_selector('.lista-integrantes')
        await foto(pa, 'celular-revisar')
        await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        for _ in range(40):
            if sql(f"select count(*) from inscripciones where evento_id = '{ev}'") == '1': break
            await pa.wait_for_timeout(500)
        fila = sql(f"select personas || ' ' || monto || ' ' || monto_revisar || ' ' || jsonb_array_length(datos -> 'integrantes') from inscripciones where evento_id = '{ev}'")
        assert fila == '3 15000 false 3', fila
        await pa.click('text=Ver inscripciones de este dispositivo') if await pa.locator('text=Ver inscripciones de este dispositivo').count() else None
        # ---- Panel
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', ev)
        await pg.wait_for_selector('.dato:has-text("Familias")')
        dato = await pg.inner_text('.dato:has-text("Familias")'); assert '3 personas' in dato, dato
        await foto(pg, 'panel-resumen')
        await pg.click('nav >> text=Inscripciones'); await pg.fill('#buscar-inscripcion', 'lola')
        await pg.click('td:has-text("Pérez (3)")'); await pg.wait_for_selector('.detalle .lista-integrantes')
        det = await pg.inner_text('.detalle'); assert 'Lola Pérez' in det and 'Niños' in det and 'Matrícula × 3' in det, det
        await foto(pg, 'panel-detalle')
        await pg.click('text=Corregir datos o medio de pago')
        await pg.fill('#corr-i3-nombre', 'Juan Carlos Pérez'); await pg.fill('#motivo-accion', 'Nombre completo')
        await pg.click('text=Guardar corrección'); await pg.wait_for_timeout(1200)
        assert sql(f"select datos -> 'integrantes' -> 2 ->> 'nombre' from inscripciones where evento_id = '{ev}'") == 'Juan Carlos Pérez'
        await pg.click('td:has-text("Pérez (3)")'); await pg.click('text=Corregir datos o medio de pago')
        await pg.click('#corregir-agregar-integrante'); await pg.fill('#corr-i4-nombre', 'Bebé Pérez'); await pg.fill('#corr-i4-edad', '1')
        await pg.fill('#motivo-accion', 'Se suma el bebé'); await pg.click('text=Guardar corrección')
        await pg.wait_for_selector('text=correspondería cobrar otro monto'); await foto(pg, 'panel-cambia-monto')
        assert sql(f"select personas from inscripciones where evento_id = '{ev}'") == '3'
        await pg.click('.detalle-encabezado button:has-text("Cerrar")'); await pg.click('nav >> text=Resumen')
        # ---- Puerta: se marca a cada integrante
        pp = await celular(b); pp.on('pageerror', lambda e: errores.append(str(e)))
        await pp.goto(URL); await pp.fill('#codigo-acceso', c_puerta); await pp.click('text=Activar con el código')
        await pp.wait_for_selector('text=de 3'); await pp.fill('#buscar-puerta', 'lola')
        await pp.wait_for_selector('.fila-puerta:has-text("Pérez (3)")')
        assert await pp.locator('.fila-puerta button.boton-presente').count() == 3, 'un botón por integrante'
        await pp.click('.fila-puerta button:has-text("Lola")'); await pp.wait_for_selector('text=Lola Pérez: presente')
        await pp.wait_for_selector('.contador-puerta >> text=1')
        await foto(pp, 'puerta', full=False)
        for _ in range(30):
            if sql(f"select string_agg(persona, ',') from asistencias where evento_id = '{ev}' and estado = 'presente'") == 'i2': break
            await pp.wait_for_timeout(500)
        assert sql(f"select string_agg(persona, ',') from asistencias where evento_id = '{ev}' and estado = 'presente'") == 'i2'
        # ---- Excel
        await pg.select_option('.selector-evento select', ev); await pg.wait_for_selector('.dato:has-text("Familias")')
        async with pg.expect_download() as d:
            await pg.click('text=Descargar Excel')
        ruta_x = os.path.join(OUT, 'familias.xlsx'); await (await d.value).save_as(ruta_x)
        with zipfile.ZipFile(ruta_x) as z:
            libro = z.read('xl/workbook.xml').decode()
            assert 'name="Integrantes"' in libro, libro
            textos = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in z.namelist() else ''.join(z.read(f).decode() for f in z.namelist() if f.startswith('xl/worksheets/'))
            assert 'Lola Pérez' in textos and 'Juan Carlos Pérez' in textos
        await b.close()
    assert not errores, errores
    print('OK: inscripción por grupo de punta a punta')

asyncio.run(main())
