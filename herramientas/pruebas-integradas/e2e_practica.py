"""Prueba integrada (Etapa 9, D56): evento de práctica de punta a punta.
Organizador crea la práctica con un toque → QR marcado «PRÁCTICA» → celular con la franja 🧪 →
inscripción (precio por categoría + transporte) → puerta → panel con el aviso → Excel PRACTICA_ →
la práctica no se ofrece para copiar → la limpieza la borra al vencer y deja intactos los eventos reales.
Correr con la base recién cargada (init_real.sql + 009 a 014)."""
import asyncio, os, sys, re, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_practica'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

async def crear_qr(pg, tarea, persona):
    await pg.click(f'text={tarea}'); await pg.fill('#nombre-colaborador', persona); await pg.click('text=Crear QR')
    await pg.wait_for_selector('.qr-codigo')
    assert 'PRÁCTICA' in await pg.inner_text('.hoja-qr'), 'la tarjeta del QR no dice PRÁCTICA'
    c = (await pg.inner_text('.qr-codigo')).strip(); return c

async def main():
    sql("insert into public.roles_usuario (usuario_id, rol) select id, r from public.usuarios, unnest(array['organizador','tesorero']) r "
        "where email = 'carlos@gmail.com' on conflict do nothing")
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        # El panel abre un evento real, no la práctica.
        await pg.click('nav >> text=Crear eventos'); await pg.wait_for_selector('#crear-practica'); await foto(pg, 'crear-eventos')
        await pg.click('#crear-practica'); await pg.wait_for_selector('text=está abierto'); await foto(pg, 'practica-abierta')
        id_prac = sql("select id from eventos where practica")
        print('práctica creada:', id_prac)
        await pg.click('text=Generar QR de colaboradores'); await pg.wait_for_selector('.aviso-practica'); await foto(pg, 'qr-practica')
        codigo = await crear_qr(pg, '+ QR de cargador', 'Voluntaria Capacitación'); await foto(pg, 'tarjeta-qr-practica'); await pg.click('text=Listo')
        codigo_p = await crear_qr(pg, '+ QR de control de presentes', 'Puerta Capacitación'); await pg.click('text=Listo')

        # Celular del cargador
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', codigo); await pa.click('text=Activar con el código')
        await pa.wait_for_selector('text=+ Nueva inscripción'); await pa.wait_for_selector('.franja.practica'); await foto(pa, 'celular-practica', full=False)
        await pa.click('text=+ Nueva inscripción'); await pa.click('button:has-text("Jóvenes")')
        for sel, val in [('#nombre', 'Lucía Práctica'), ('#dni', '40111222'), ('#telefono', '3624000111'), ('#edad', '22')]:
            await pa.fill(sel, val)
        g = lambda l: f'[role=radiogroup][aria-label="{l}"]'
        await pa.locator(g('¿Viaja en el transporte del evento?') + ' button:has-text("Sí")').click()
        await pa.locator(g('¿Tiene restricciones alimentarias?') + ' button:has-text("No")').click()
        await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
        await pa.click('text=Revisar y cobrar'); await foto(pa, 'celular-confirmar', full=False)
        await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        r = ''
        for _ in range(30):
            r = sql(f"select monto || '|' || monto_revisar from inscripciones where evento_id = '{id_prac}'")
            if r: break
            await pa.wait_for_timeout(500)
        print('en la base:', r); assert r == '3500|false', r

        # Puerta
        pp = await celular(b); pp.on('pageerror', lambda e: errores.append(str(e)))
        await pp.goto(URL); await pp.fill('#codigo-acceso', codigo_p); await pp.click('text=Activar con el código')
        await pp.wait_for_selector('.franja.practica'); await pp.fill('#buscar-puerta', 'luc')
        await pp.click('button:has-text("Presente")'); await foto(pp, 'puerta-practica', full=False)
        for _ in range(30):
            m = sql(f"select count(*) from asistencias where evento_id = '{id_prac}' and estado = 'presente'")
            if m == '1': break
            await pp.wait_for_timeout(500)
        assert m == '1', m

        # Panel: aviso, Excel y que no se ofrezca para copiar
        await pg.click('nav >> text=Resumen'); await pg.select_option('.selector-evento select', id_prac)
        await pg.wait_for_selector('.aviso-practica'); await foto(pg, 'resumen-practica')
        async with pg.expect_download() as d:
            await pg.click('text=Descargar Excel')
        nombre = (await d.value).suggested_filename; print('Excel:', nombre); assert nombre.startswith('PRACTICA_'), nombre
        await pg.click('nav >> text=Crear eventos'); await pg.wait_for_selector('text=Prácticas en curso')
        opciones = await pg.locator('#copiar-de option').all_inner_texts()
        assert not any('práctica' in o.lower() for o in opciones), opciones
        await foto(pg, 'practicas-en-curso')

        # Al vencer, se borra sola con todo; los eventos reales quedan.
        reales = sql("select count(*) from eventos where not practica")
        sql(f"update eventos set definicion = definicion || jsonb_build_object('fechaFin', current_date - 3) where id = '{id_prac}'")
        print('borradas:', sql("select public.limpiar_practicas()"))
        assert sql(f"select count(*) from inscripciones where evento_id = '{id_prac}'") == '0'
        assert sql("select count(*) from eventos where practica") == '0'
        assert sql("select count(*) from eventos where not practica") == reales
        await b.close()
    assert not errores, errores
    print('OK: evento de práctica de punta a punta')

asyncio.run(main())
