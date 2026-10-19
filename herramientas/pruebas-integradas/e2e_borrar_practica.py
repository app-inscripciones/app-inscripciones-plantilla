"""Prueba integrada (D63 a D66): nombres sin repetir, borrar y archivar eventos, cambiar o dejar el acceso en el
celular, aviso de la primera vez y avisos de práctica. Correr con la base recién cargada (con 021) y SIN la práctica
de Carlos anotada:  SIN_PRACTICA=1 reset.sh"""
import asyncio, os, sys, re, subprocess, json, datetime
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar, URL
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_borrar'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre, full=True):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=full)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

async def celular(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    await c.route(re.compile(r'supabase\.co/'), ruta); return await c.new_page()

async def nuevo_qr(pg, nombre, boton='+ QR de cargador'):
    await pg.click(f'text={boton}'); await pg.fill('#nombre-colaborador', nombre); await pg.click('text=Crear QR')
    await pg.wait_for_selector('.qr-codigo'); c = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo'); return c

async def main():
    assert sql("select count(*) from practicas_hechas") == '0', 'correr con SIN_PRACTICA=1'
    sql("insert into public.roles_usuario (usuario_id, rol) select id, r from public.usuarios, unnest(array['organizador','tesorero']) r where email = 'carlos@gmail.com' on conflict do nothing")
    hoy = datetime.date.today()
    def abrir_por_sql(nombre, dias):
        d = json.loads(subprocess.run(['node', os.path.join(DIR, 'defgrupo.mjs'), 'persona', (hoy + datetime.timedelta(days=dias)).isoformat()], capture_output=True, text=True, check=True).stdout)
        d['nombre'] = nombre; j = json.dumps(d).replace("'", "''")
        sql(f"""set role authenticated; set request.jwt.claims = '{{"email":"carlos@gmail.com"}}';
            select public.panel_abrir_evento(public.panel_guardar_borrador(null, '{j}'::jsonb) ->> 'id', '{j}'::jsonb)""")
        return sql(f"select id from eventos where nombre = '{nombre}'")
    abrir_por_sql('Culto de jóvenes', 15)
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')

        # ---- Primeros pasos: la práctica va antes del primer evento
        await pg.wait_for_selector('.primeros-pasos')
        assert 'Hacer la práctica' in await pg.inner_text('.primeros-pasos')

        # ---- Crear evento nuevo sin haber practicado: aviso con «Practicar ahora» / «Seguir igual»
        await pg.click('nav >> text=Crear eventos'); await pg.wait_for_selector('#crear-evento')
        assert 'Tu práctica de Organizador' in await pg.inner_text('main')
        await pg.click('#crear-evento'); await pg.wait_for_selector('.aviso-practica-previa')
        assert 'Todavía no hiciste la práctica de Organizador' in await pg.inner_text('.aviso-practica-previa')
        await foto(pg, 'aviso-practica')
        await pg.click('#seguir-sin-practica'); await pg.wait_for_selector('#ev-nombre')

        # ---- Nombre repetido (D63): «congreso  de PRUEBA» = «Congreso de prueba»
        await pg.fill('#ev-nombre', 'culto  de JOVENES'); await pg.click('#siguiente')
        await pg.wait_for_selector('text=Ya hay un evento llamado «Culto de jóvenes»'); await foto(pg, 'nombre-repetido', full=False)
        await pg.fill('#ev-nombre', 'Jornada de prueba'); await pg.click('#siguiente')
        await pg.fill('#ev-fecha', (hoy + datetime.timedelta(days=3)).isoformat()); await pg.click('#siguiente')
        await pg.wait_for_selector('#ev-persona'); await pg.click('#siguiente')
        await pg.wait_for_selector('#mod-presencial'); await pg.click('#siguiente')
        await pg.wait_for_selector('#cat-si'); await pg.click('#siguiente')
        await pg.wait_for_selector('text=Datos frecuentes'); await pg.click('#siguiente')
        await pg.locator('.concepto input[aria-label="Precio Precio"]').fill('1000'); await pg.click('#siguiente')
        await pg.wait_for_selector('#auto-si'); await pg.click('#siguiente')
        await pg.wait_for_selector('.resumen-simple')
        assert 'abrir un evento real' in await pg.inner_text('.aviso-practica-previa')
        await pg.click('#abrir-evento'); await pg.click('#confirmar-abrir'); await pg.wait_for_selector('text=está abierto')
        ev = sql("select id from eventos where nombre = 'Jornada de prueba'")

        # ---- QR para un evento real: aviso dentro del formulario (no bloquea). Las listas muestran la fecha.
        await pg.click('text=Generar QR de colaboradores'); await pg.wait_for_selector('h2:has-text("Jornada de prueba")')
        assert await pg.locator(f'button.opcion:has-text("{(hoy + datetime.timedelta(days=3)).strftime("%d/%m/%Y")}")').count() >= 1, 'el botón del evento muestra la fecha'
        await pg.click('text=+ QR de cargador'); await pg.wait_for_selector('.aviso-practica-previa')
        await foto(pg, 'aviso-qr', full=False)
        await pg.fill('#nombre-colaborador', 'Ana Cargadora'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-codigo'); c1 = (await pg.inner_text('.qr-codigo')).strip(); await pg.click('text=Listo')
        await pg.click('button.opcion:has-text("Congreso de prueba")')
        c2 = await nuevo_qr(pg, 'Ana Cargadora')

        # ---- Celular: aviso de la primera vez (D66), una inscripción en efectivo
        pa = await celular(b); pa.on('pageerror', lambda e: errores.append(str(e)))
        await pa.goto(URL); await pa.fill('#codigo-acceso', c1); await pa.click('text=Activar con el código')
        await pa.wait_for_selector('.aviso-primera-vez'); await foto(pa, 'primera-vez', full=False)
        await pa.click('#entendido-primera-vez'); await pa.wait_for_selector('.aviso-primera-vez', state='detached')
        await pa.click('text=+ Nueva inscripción')
        await pa.fill('#nombre', 'Ana Sosa'); await pa.fill('#dni', '30111222'); await pa.fill('#telefono', '3624111222')
        await pa.locator('[aria-label="Medio de pago"] button:has-text("Efectivo")').click()
        await pa.click('text=Revisar y cobrar'); await pa.click('text=Sí, guardar inscripción'); await pa.wait_for_selector('text=Inscripción guardada')
        for _ in range(40):
            if sql(f"select count(*) from inscripciones where evento_id = '{ev}'") == '1': break
            await pa.wait_for_timeout(500)

        # ---- Celular con acceso que escanea otro QR (D64): pregunta; «Seguir» y después «Cambiar»
        await pa.goto(URL + '?a=' + c2.replace('-', '')); await pa.wait_for_selector('#activar-nuevo-qr')
        assert 'Jornada de prueba' in await pa.inner_text('main'); await foto(pa, 'otro-qr', full=False)
        await pa.click('#seguir-acceso-actual'); await pa.wait_for_selector('text=+ Nueva inscripción')
        await pa.goto(URL + '?a=' + c2.replace('-', '')); await pa.wait_for_selector('#activar-nuevo-qr')
        await pa.click('#activar-nuevo-qr'); await pa.wait_for_selector('#codigo-acceso')
        await pa.click('text=Activar con el código'); await pa.wait_for_selector('text=+ Nueva inscripción')
        assert 'Congreso de prueba' in await pa.inner_text('header')
        assert await pa.locator('.aviso-primera-vez').count() == 0, 'el aviso de la primera vez sale una sola vez'
        # Dejar este acceso
        await pa.click('#dejar-acceso'); await pa.wait_for_selector('#confirmar-dejar-acceso'); await foto(pa, 'dejar-acceso', full=False)
        await pa.click('#confirmar-dejar-acceso'); await pa.wait_for_selector('#codigo-acceso')

        # ---- Borrar un evento sin datos (D65)
        abrir_por_sql('Evento vacío', 10)
        vacio = sql("select id from eventos where nombre = 'Evento vacío'")
        await pg.goto(URL + '#panel'); await pg.reload(); await pg.wait_for_selector('.selector-evento select')
        await pg.select_option('.selector-evento select', vacio)
        await pg.click('#borrar-archivar'); await pg.wait_for_selector('text=Borrar este evento')
        assert await pg.locator('#confirmar-borrar-archivar').is_disabled()
        await pg.fill('#confirmar-nombre-evento', 'evento vacio'); await foto(pg, 'borrar', full=False)
        await pg.click('#confirmar-borrar-archivar')
        for _ in range(20):
            if sql(f"select count(*) from eventos where id = '{vacio}'") == '0': break
            await pg.wait_for_timeout(300)
        assert sql(f"select count(*) from eventos where id = '{vacio}'") == '0', 'se borró'
        await pg.wait_for_timeout(800)
        assert 'Evento vacío' not in await pg.inner_text('.selector-evento select')

        # ---- Archivar un evento con datos: primero falta rendir
        await pg.select_option('.selector-evento select', ev)
        await pg.click('#borrar-archivar'); await pg.wait_for_selector('text=Archivar este evento')
        await pg.wait_for_selector('text=No se puede archivar todavía'); await foto(pg, 'archivar-pendiente', full=False)
        # Rendición (Tesorero, sin práctica: aviso) y archivar
        await pg.click('nav >> text=Rendiciones'); await pg.click('text=Registrar entrega')
        await pg.wait_for_selector('.aviso-practica-previa'); assert 'práctica de Tesorero' in await pg.inner_text('.aviso-practica-previa')
        await foto(pg, 'aviso-rendicion', full=False)
        await pg.click('#registrar-rendicion'); await pg.wait_for_timeout(1200)
        await pg.click('nav >> text=Resumen'); await pg.click('#borrar-archivar')
        await pg.wait_for_selector('text=Este evento todavía no terminó')
        await pg.fill('#confirmar-nombre-evento', 'Jornada de prueba'); await foto(pg, 'archivar', full=False)
        await pg.click('#confirmar-borrar-archivar'); await pg.wait_for_selector('.aviso-archivado')
        await foto(pg, 'archivado', full=False)
        assert sql(f"select archivado_en is not null and inscripciones_cerradas_en is not null from eventos where id = '{ev}'") == 't'
        # QR de colaboradores ya no lo ofrece
        await pg.click('nav >> text=QR de colaboradores'); await pg.wait_for_timeout(800)
        assert await pg.locator('button.opcion:has-text("Jornada de prueba")').count() == 0
        # Ver archivados y volver a mostrar
        await pg.click('nav >> text=Resumen'); await pg.wait_for_selector('#ver-archivados')
        await pg.check('#ver-archivados'); await pg.select_option('.selector-evento select', ev)
        await pg.click('#desarchivar'); await pg.wait_for_selector('.aviso-archivado', state='detached')
        assert sql(f"select archivado_en is null from eventos where id = '{ev}'") == 't'

        # ---- Practicar: «Crear evento de práctica» tilda el primer paso
        await pg.click('nav >> text=Crear eventos'); await pg.click('#crear-practica'); await pg.wait_for_timeout(1500)
        assert sql("select count(*) from practicas_hechas where correo = 'carlos@gmail.com' and paso in ('crear')") == '1'
        await pg.click('nav >> text=Crear eventos'); await pg.wait_for_selector('.lista-practica li.hecho')
        await foto(pg, 'tu-practica', full=False)

        print('auditoría:', sql("select string_agg(accion, ',' order by id) from auditoria where accion in ('borrar_evento','archivar_evento','desarchivar_evento')"))
        print('errores:', errores); assert not errores, errores
        await b.close()
    print('OK: nombres, borrar y archivar, cambiar de QR y práctica')

asyncio.run(main())
