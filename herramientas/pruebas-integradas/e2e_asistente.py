"""Prueba integrada de la Etapa 6: crear un evento con el asistente, abrirlo y cargar una inscripción con QR."""
import asyncio, os, sys, re, subprocess, json
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_asistente'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)

def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def main():
    sql("delete from public.asistencias where evento_id like 'campamento%'; delete from public.inscripciones where evento_id like 'campamento%'; "
        "delete from public.sesiones where acceso_id in (select id from public.accesos where evento_id like 'campamento%'); "
        "delete from public.accesos where evento_id like 'campamento%'; delete from public.eventos where id like 'campamento%'")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        await pg.click('nav >> text=Crear eventos'); await pg.wait_for_selector('#crear-evento'); await foto(pg, 'inicio')
        await pg.click('#crear-evento')
        # 1 nombre: «Siguiente» sin nombre muestra el error
        await pg.click('#siguiente'); await pg.wait_for_selector('text=Escribí el nombre del evento.')
        await pg.fill('#ev-nombre', 'Campamento de jóvenes'); await foto(pg, 'paso-nombre')
        await pg.click('#siguiente')
        # 2 fechas
        await pg.fill('#ev-fecha', '2027-01-15'); await pg.click('#ev-varios'); await pg.fill('#ev-fecha-fin', '2027-01-17')
        await foto(pg, 'paso-fechas'); await pg.click('#siguiente')
        # 3 unidad
        await pg.wait_for_selector('#ev-persona'); await foto(pg, 'paso-unidad'); await pg.click('#siguiente')
        # 3 bis modalidad (presencial por defecto)
        await pg.wait_for_selector('#mod-presencial.elegida'); await foto(pg, 'paso-modalidad'); await pg.click('#siguiente')
        # 4 categorías
        await pg.click('#cat-si'); await pg.click('text=Usar: Niños, Adolescentes, Jóvenes y Adultos'); await foto(pg, 'paso-categorias')
        await pg.click('#siguiente')
        # 5 datos
        await pg.wait_for_selector('text=Datos frecuentes'); await foto(pg, 'paso-datos-inicio')
        for t in ['Edad', 'Lugar o institución de origen', 'Si viaja en el transporte del evento', 'Restricciones alimentarias']:
            await pg.check(f'input[aria-label="{t}"]')
        await pg.fill('input[aria-label="Texto de Lugar o institución de origen"]', 'Iglesia de origen')
        await pg.click('text=+ Agregar otra pregunta')
        q = pg.locator('.pregunta-propia').last
        await q.locator('input[aria-label="Texto de la pregunta"]').fill('Talle de remera')
        await q.locator('select[aria-label="Tipo de respuesta"]').select_option('opcion')
        await q.locator('input[aria-label="Opción 1"]').fill('S'); await q.locator('input[aria-label="Opción 2"]').fill('M')
        await q.locator('text=+ Agregar opción').click(); await q.locator('input[aria-label="Opción 3"]').fill('L')
        await foto(pg, 'paso-datos'); await pg.click('#siguiente')
        # 6 cobro
        await pg.wait_for_selector('text=¿Qué se cobra?')
        c1 = pg.locator('.concepto').first
        await c1.locator('text=Precio según la categoría').click()
        await c1.locator('text=Precio anticipado (más barato hasta una fecha)').click()
        await c1.locator('input[aria-label="Precio anticipado hasta"]').fill('2026-12-15')
        precios = {'Niños': (10000, 15000), 'Adolescentes': (20000, 25000), 'Jóvenes': (30000, 35000), 'Adultos': (40000, 45000)}
        tramos = c1.locator('.tramo')
        for k in (0, 1):
            for cat, ps in precios.items():
                await tramos.nth(k).locator(f'input[aria-label="Precio {cat}"]').fill(str(ps[k]))
        await pg.click('text=+ Agregar otro cobro')
        c2 = pg.locator('.concepto').nth(1)
        await c2.locator('input[aria-label="Nombre del concepto"]').fill('Transporte')
        await c2.locator('select').select_option(label='Solo si en «¿Viaja en el transporte del evento?» responde «Sí»')
        await c2.locator('input[aria-label="Precio Precio"]').fill('5000')
        await foto(pg, 'paso-cobro'); await pg.click('#siguiente')
        # 7 asistencia
        await pg.wait_for_selector('#as-llegada'); await foto(pg, 'paso-asistencia-opciones')
        await pg.click('#as-turnos'); await pg.click('.opcion:has-text("Noche")')
        await pg.wait_for_selector('text=Viernes 15/01 – noche')
        await pg.locator('.vista-puerta .boton-presente').first.click(); await pg.wait_for_selector('.vista-puerta .estado-puerta')
        await foto(pg, 'paso-asistencia')
        await pg.click('#siguiente')
        # 8 resumen + vista previa
        await pg.wait_for_selector('.resumen-simple'); await foto(pg, 'paso-resumen')
        texto = await pg.inner_text('.resumen-simple'); print(texto)
        vp = pg.locator('.pantalla-celular')
        await vp.locator('button:has-text("Jóvenes")').click()
        await vp.locator('#nombre').fill('Prueba Vista'); await vp.locator('#dni').fill('30111222')
        await vp.locator('[aria-label="¿Viaja en el transporte del evento?"] button:has-text("Sí")').click()
        await foto(pg, 'vista-previa')
        await vp.locator('text=Revisar y cobrar').click(); await vp.locator('.con-error').first.wait_for()
        # salir y continuar después (queda borrador)
        await pg.click('text=Guardar y seguir después'); await pg.wait_for_selector('.borrador:has-text("Campamento de jóvenes")'); await foto(pg, 'borradores')
        assert sql("select estado from eventos where nombre = 'Campamento de jóvenes'") == 'borrador'
        await pg.click('.borrador:has-text("Campamento de jóvenes") >> text=Continuar')
        await pg.wait_for_selector('.resumen-simple')
        await pg.click('#abrir-evento'); await foto(pg, 'confirmar-abrir')
        await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto'); await foto(pg, 'abierto')
        d = json.loads(sql("select definicion from eventos where id = 'campamento-de-jovenes-2027' and estado = 'abierto'"))
        print('instancias:', [i['nombre'] for i in d['asistencia']['instancias']])
        assert len(d['asistencia']['instancias']) == 6 and d['asistencia']['campoProcedencia'] == 'procedencia'
        # QR de cargador para el evento nuevo
        await pg.click('text=Generar QR de colaboradores')
        await pg.click('button.opcion:has-text("Campamento de jóvenes")')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Rocío Paz'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); codigo = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        # celular: inscripción con precio anticipado vencido? hoy 12/10/2026 < 15/12 → anticipado
        c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await c.route(re.compile(r'supabase\.co/'), ruta)
        pa = await c.new_page(); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=Cargador:')
        await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Jóvenes")')
        for sel, val in [('#nombre', 'Tomás Ruiz'), ('#dni', '41222333'), ('#telefono', '3624555666'), ('#edad', '22'), ('#procedencia', 'Central')]:
            await pa.fill(sel, val)
        g = lambda l: f'[role=radiogroup][aria-label="{l}"]'
        await pa.locator(g('¿Viaja en el transporte del evento?') + ' button:has-text("Sí")').click()
        await pa.locator(g('¿Tiene restricciones alimentarias?') + ' button:has-text("No")').click()
        await pa.locator(g('Talle de remera') + ' button:has-text("M")').click()
        await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
        await foto(pa, 'celular-formulario')
        await pa.click('text=Revisar y cobrar'); await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        for _ in range(30):
            r = sql("select monto || '|' || datos::text from inscripciones where evento_id = 'campamento-de-jovenes-2027'")
            if r: break
            await pa.wait_for_timeout(500)
        print('en la base:', r); assert r.startswith('35000|'), r
        # copiar el Retiro modelo: con nombre y fechas ya queda listo para revisar
        await pg.click('nav >> text=Crear eventos'); await pg.select_option('#copiar-de', 'retiro-matrimonios-modelo'); await pg.click('button:has-text("Copiar")')
        await pg.fill('#ev-nombre', 'Retiro de matrimonios 2027'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', '2027-05-08'); await pg.click('#ev-varios'); await pg.fill('#ev-fecha-fin', '2027-05-09'); await pg.click('#siguiente')
        await pg.wait_for_selector('#ev-pareja.elegida'); await pg.click('text=9Revisar y abrir')
        await pg.wait_for_selector('.resumen-simple'); txt = await pg.inner_text('.resumen-simple'); print(txt)
        assert 'pareja junta' in txt and 'Sábado 08/05 – mañana' in txt
        await foto(pg, 'copia-retiro')
        await pg.click('text=Guardar y seguir después')
        # pantalla angosta (celular) del asistente
        pm = await (await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR')).new_page()
        await pm.context.route(re.compile(r'supabase\.co/'), ruta)
        await ingresar(pm, 'carlos@gmail.com'); await pm.click('nav >> text=Crear eventos')
        await pm.click('.borrador:has-text("Retiro de matrimonios 2027") >> text=Continuar'); await pm.click('text=7Asistencia') if False else None
        await pm.wait_for_selector('.resumen-simple'); await foto(pm, 'celular-asistente', full=False)
        print('errores:', errores); await b.close()
        if errores: sys.exit(1)

asyncio.run(main())
