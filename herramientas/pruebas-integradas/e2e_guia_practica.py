"""Prueba integrada (D68 y D69): asistente de práctica (paso a paso, QR cerrado sin activar → «Crear otro QR»,
celular, presente, Tesorero y festejo) y preguntas frecuentes opcionales en el asistente de eventos.
Correr con la base recién cargada y SIN la práctica de Carlos anotada:  SIN_PRACTICA=1 reset.sh"""
import asyncio, os, sys, re, subprocess, datetime
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_guia'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=False):
    n[0] += 1; await pg.wait_for_timeout(350)
    if not full: await pg.evaluate('window.scrollTo(0, 0)')
    await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

async def guia_dice(pg, texto, segundos=25):
    for _ in range(segundos * 2):
        if await pg.locator('#guia-practica').count() and texto in await pg.inner_text('#guia-practica'): return
        await pg.wait_for_timeout(500)
    raise AssertionError(f'el asistente no dice «{texto}»: {await pg.inner_text("#guia-practica") if await pg.locator("#guia-practica").count() else "(no está)"}')

async def main():
    assert sql("select count(*) from practicas_hechas") == '0', 'correr con SIN_PRACTICA=1'
    sql("insert into public.roles_usuario (usuario_id, rol) select id, r from public.usuarios, unnest(array['organizador','tesorero']) r where email = 'carlos@gmail.com' on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')

        # Paso 1 de 3: crear la práctica
        await guia_dice(pg, 'Paso 1 de 3'); await foto(pg, 'paso1')
        await pg.click('#guia-practica-accion')
        # Paso 2: lleva al formulario del QR, ya abierto, con el nombre de quien practica
        await pg.wait_for_selector('#nombre-colaborador')
        assert (await pg.input_value('#nombre-colaborador')).strip() != '', 'el nombre viene completado'
        await guia_dice(pg, 'Paso 2 de 3'); await foto(pg, 'paso2')
        await pg.click('button:text-is("Crear QR")'); await pg.wait_for_timeout(1500); await foto(pg, 'tras-crear', full=True)
        await pg.wait_for_selector('.qr-codigo')
        await guia_dice(pg, 'Paso 3 de 3')
        # Se cierra la pantalla del QR sin activarlo: el asistente lo nota y ofrece «Crear otro QR»
        await pg.click('text=Listo')
        await guia_dice(pg, 'Si ya cerraste la pantalla del QR'); await foto(pg, 'paso3-olvido')
        viejo = sql("select id from accesos where cerrado_en is null")
        await pg.click('#guia-practica-accion'); await pg.wait_for_selector('#nombre-colaborador')
        assert sql(f"select cerrado_en is not null from accesos where id = '{viejo}'") == 't', 'el QR sin activar se cerró solo'
        await pg.click('button:text-is("Crear QR")'); await pg.wait_for_selector('.qr-codigo')
        codigo = (await pg.inner_text('.qr-codigo')).strip()

        # Celular: activa el QR → el asistente lo ve
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código')
        await pa.wait_for_selector('text=+ Nueva inscripción')
        await pg.click('text=Listo')
        await guia_dice(pg, 'ya está activado'); await foto(pg, 'paso3-activado')
        # Inscripción con «Ya está presente» → práctica del Organizador terminada
        await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Jóvenes")')
        for sel, val in [('#nombre', 'Lucía Práctica'), ('#dni', '40111222'), ('#telefono', '3624000111'), ('#edad', '22')]:
            await pa.fill(sel, val)
        g = lambda l: f'[role=radiogroup][aria-label="{l}"]'
        await pa.locator(g('¿Viaja en el transporte del evento?') + ' button:has-text("No")').click()
        await pa.locator(g('¿Tiene restricciones alimentarias?') + ' button:has-text("No")').click()
        await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
        await pa.click('text=Revisar y cobrar'); await pa.check('.ya-presente input')
        await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        # Después: la del Tesorero (Carlos tiene los dos roles)
        await guia_dice(pg, 'Tu práctica de Tesorero'); await foto(pg, 'tesorero')
        assert sql("select count(*) from practicas_hechas where correo = 'carlos@gmail.com' and paso in ('crear','qr','inscripcion','presente')") == '4'
        await pg.click('#guia-practica-accion'); await pg.wait_for_selector('button:text-is("Registrar entrega")')
        await pg.click('button:text-is("Registrar entrega")'); await pg.fill('#monto-rendicion', '3000'); await pg.click('#registrar-rendicion')
        await guia_dice(pg, 'Práctica terminada'); await foto(pg, 'terminada')
        await pg.click('#cerrar-guia-practica'); await pg.wait_for_selector('#guia-practica', state='detached')
        await pg.reload(); await pg.wait_for_timeout(2500)
        assert await pg.locator('#guia-practica').count() == 0, 'el festejo sale una sola vez'

        # D68: preguntas frecuentes opcionales
        hoy = datetime.date.today()
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-evento')
        await pg.fill('#ev-nombre', 'Jornada con datos opcionales'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', (hoy + datetime.timedelta(days=5)).isoformat()); await pg.click('#siguiente')
        await pg.wait_for_selector('#ev-persona'); await pg.click('#siguiente')
        await pg.wait_for_selector('#mod-presencial'); await pg.click('#siguiente')
        await pg.wait_for_selector('#cat-si'); await pg.click('#siguiente')
        await pg.wait_for_selector('text=Datos frecuentes')
        caja = pg.locator('[aria-label="Teléfono de contacto: obligatoria"]')
        assert await caja.is_checked(), 'por defecto obligatoria'
        await caja.uncheck(); await pg.wait_for_selector('text=puede dejarla en blanco')
        await pg.locator('[aria-label="DNI: obligatoria"]').uncheck()
        await foto(pg, 'datos-opcionales', full=True)
        await pg.click('#siguiente')
        await pg.locator('.concepto input[aria-label="Precio Precio"]').fill('1000'); await pg.click('#siguiente')
        await pg.wait_for_selector('#auto-si'); await pg.click('#siguiente')
        await pg.wait_for_selector('.resumen-simple')
        t = await pg.inner_text('.resumen-simple'); assert 'Teléfono de contacto (opcional)' in t and 'DNI (opcional)' in t, t
        assert 'El DNI es opcional' in await pg.inner_text('main')
        await pg.locator('.pantalla-celular >> text=+ Nueva inscripción').click() if await pg.locator('.pantalla-celular >> text=+ Nueva inscripción').count() else None
        assert '(opcional)' in await pg.inner_text('.pantalla-celular'), 'la vista previa marca las opcionales'
        await foto(pg, 'resumen-opcionales', full=True)
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        d = sql("select string_agg((c->>'id') || '=' || (c->>'obligatorio'), ',') from eventos e, jsonb_array_elements(e.definicion->'campos') c where e.nombre = 'Jornada con datos opcionales'")
        print('campos:', d); assert 'telefono=false' in d and 'dni=false' in d and 'nombre=true' in d

        print('errores:', errores); assert not errores, errores
        await b.close()
    print('OK: asistente de práctica y datos opcionales')

asyncio.run(main())
