"""Prueba INTEGRADA: la app real contra la base real (PostgreSQL + PostgREST locales, con las funciones SQL
del proyecto). Solo se simula el envío del correo con el código (Supabase Auth)."""
import asyncio, json, os, sys, time, base64, hmac, hashlib, uuid, re, urllib.request
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
PGRST = 'http://localhost:3000'
SECRET = b'secreto-de-prueba-de-al-menos-32-caracteres!!'
DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_real'); os.makedirs(OUT, exist_ok=True)
CODIGOS = {}

def b64(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def jwt(email):
    h = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    p = b64(json.dumps({'sub': str(uuid.uuid5(uuid.NAMESPACE_DNS, email)), 'email': email, 'role': 'authenticated',
                        'aud': 'authenticated', 'exp': int(time.time()) + 3600}).encode())
    s = b64(hmac.new(SECRET, f'{h}.{p}'.encode(), hashlib.sha256).digest())
    return f'{h}.{p}.{s}'

def proxy_rpc(nombre, body, auth):
    req = urllib.request.Request(f'{PGRST}/rpc/{nombre}', data=body or b'{}', method='POST',
                                 headers={'Content-Type': 'application/json', **({'Authorization': auth} if auth else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

async def ruta(route):
    req = route.request; url = req.url
    if '/auth/v1/otp' in url:
        e = json.loads(req.post_data)['email']
        st, b = proxy_rpc('correo_habilitado', json.dumps({'p_email': e}).encode(), None)
        if b.strip() != b'true': return await route.fulfill(status=403, content_type='application/json', body='{"msg":"no habilitado"}')
        CODIGOS[e] = '424242'; return await route.fulfill(status=200, content_type='application/json', body='{}')
    if '/auth/v1/verify' in url:
        d = json.loads(req.post_data)
        if CODIGOS.get(d['email']) != d['token']: return await route.fulfill(status=403, content_type='application/json', body='{"msg":"invalid"}')
        user = {'id': str(uuid.uuid5(uuid.NAMESPACE_DNS, d['email'])), 'aud': 'authenticated', 'role': 'authenticated', 'email': d['email'], 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-12T00:00:00Z'}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'access_token': jwt(d['email']), 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'refresh_token': uuid.uuid4().hex, 'user': user}))
    if '/auth/v1/logout' in url: return await route.fulfill(status=204, body='')
    if '/rest/v1/rpc/' in url:
        nombre = url.rsplit('/', 1)[1].split('?')[0]
        auth = req.headers.get('authorization', '')
        auth = auth if auth.count('.') == 2 else None  # la clave pública no es un JWT: va como anónimo
        st, b = await asyncio.to_thread(proxy_rpc, nombre, (req.post_data or '{}').encode(), auth)
        return await route.fulfill(status=st, content_type='application/json', body=b)
    await route.continue_()

n = [0]
async def foto(pg, nombre):
    n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=True)

async def ingresar(pg, correo):
    await pg.goto(URL + '#panel'); await pg.wait_for_selector('#correo-panel')
    await pg.fill('#correo-panel', correo); await pg.click('text=Enviarme el código')
    await pg.fill('#codigo-panel', '424242'); await pg.click('button:has-text("Entrar")')
    await pg.wait_for_selector('nav.pestanas')

async def main():
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1200, 'height': 850}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires', accept_downloads=True)
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))

        # 1) Carlos (Responsable) se agrega Organizador y Tesorero, y da de alta a una persona de Consulta
        await ingresar(pg, 'carlos@gmail.com'); await foto(pg, 'carlos-inicio')
        await pg.click('nav >> text=Personas y roles')
        await pg.click('tr:has-text("carlos@gmail.com") >> text=Modificar')
        await pg.click('.rol-opcion:has-text("Organizador")'); await pg.click('.rol-opcion:has-text("Tesorero")')
        await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('tr:has-text("carlos@gmail.com") >> text=Tesorero')
        await pg.click('text=+ Agregar persona'); await pg.fill('#nombre-usuario', 'Pastor Daniel'); await pg.fill('#correo-usuario', 'daniel@mail.com')
        await pg.click('.rol-opcion:has-text("Consulta")'); await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('td:has-text("daniel@mail.com")')
        await pg.reload(); await pg.wait_for_selector('nav >> text=QR de colaboradores')

        # 2) QR de cargador para Ana desde el panel
        await pg.click('nav >> text=QR de colaboradores'); await pg.click('text=+ QR de cargador')
        await pg.fill('#nombre-colaborador', 'Ana Pérez'); await pg.click('text=Crear QR'); await pg.wait_for_selector('.qr-codigo')
        codigo = (await pg.inner_text('.qr-codigo')).strip(); print('codigo real:', codigo)
        await pg.click('text=Listo')

        # 3) Ana activa en su celular y carga 3 inscripciones contra la base real
        cel = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await cel.add_init_script("const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('standalone') ? { matches: true, media: q, addEventListener(){}, removeEventListener(){} } : mm(q); navigator.storage.persist = async () => true; navigator.storage.persisted = async () => true;")
        await cel.route(re.compile(r'supabase\.co/'), ruta)
        pc2 = await cel.new_page(); pc2.on('pageerror', lambda e: errores.append(str(e)))
        await pc2.goto(URL); await pc2.fill('#codigo-acceso', codigo); await pc2.click('text=Activar con el código')
        await pc2.wait_for_selector('text=Cargador:')
        g = lambda l: f'[role=radiogroup][aria-label="{l}"]'
        async def inscribir(cat, nombre, dni, medio, transporte='No'):
            await pc2.click('text=+ Nueva inscripción'); await pc2.click(f'button:has-text("{cat}")')
            for sel, val in [('#nombre', nombre), ('#dni', dni), ('#telefono', '3624000111'), ('#edad', '25'), ('#iglesia', 'Central')]:
                await pc2.fill(sel, val)
            if await pc2.locator(g('¿Usa el transporte?')).count():
                await pc2.locator(g('¿Usa el transporte?') + f' button:has-text("{transporte}")').click()
            await pc2.locator(g('¿Tiene intolerancia al gluten?') + ' button:has-text("No")').click()
            await pc2.locator(g('¿Tiene otras restricciones alimentarias?') + ' button:has-text("No")').click()
            await pc2.locator(f'[aria-label="Medio de pago"] button:has-text("{medio}")').click()
            if medio == 'Transferencia':
                await pc2.fill('#banco', 'Mercado Pago'); await pc2.fill('#ultimos6', 'a1b2c3')
            await pc2.click('text=Revisar y cobrar'); await pc2.click('text=Sí, guardar inscripción')
            await pc2.wait_for_selector('text=Inscripción guardada')
        await inscribir('Jóvenes de 21 a 30 años', 'Laura Díaz', '35111222', 'Efectivo', 'Sí')
        await inscribir('Adultos (casados o mayores de 30)', 'Mario Gómez', '20111222', 'Transferencia')
        await inscribir('Jóvenes de 21 a 30 años', 'Sofía Díaz', '35111222', 'Efectivo')   # mismo DNI: posible duplicado
        await pc2.wait_for_selector('text=Todo enviado', timeout=20000); await foto(pc2, 'cel-enviado')

        # 4) Panel: resumen con los números reales
        await pg.click('nav >> text=Resumen'); await pg.wait_for_selector('text=Efectivo pendiente de rendir')
        await pg.select_option('.selector-evento select', 'congreso-prueba'); await pg.wait_for_selector('h2:has-text("Congreso de prueba")')
        await pg.click('text=Actualizar'); await pg.wait_for_timeout(800); await foto(pg, 'resumen')
        txt = await pg.inner_text('main'); print('--- resumen ---'); print(txt[:900])

        # 5) Inscripciones: revisar el posible duplicado, corregir medio de pago, anular
        await pg.click('.advertencia >> text=Ver'); await pg.wait_for_selector('td:has-text("Sofía Díaz")'); await foto(pg, 'para-revisar')
        await pg.click('td:has-text("Sofía Díaz")'); await pg.wait_for_selector('.detalle'); await foto(pg, 'detalle-duplicado')
        await pg.click('text=Anular inscripción'); await pg.fill('#motivo-accion', 'Era la misma persona cargada dos veces'); await pg.click('button:has-text("Sí, anular")')
        await pg.wait_for_selector('.detalle', state='detached')
        await pg.click('.opcion:has-text("Todas")'); await pg.wait_for_selector('td:has-text("Laura Díaz")')
        await pg.click('td:has-text("Laura Díaz")'); await pg.click('text=Corregir datos o medio de pago')
        await pg.locator('.detalle label:has-text("Nombre y apellido") input').fill('Laura Díaz Paz')
        await pg.fill('#motivo-accion', 'Apellido incompleto'); await foto(pg, 'corregir')
        await pg.click('text=Guardar corrección'); await pg.wait_for_selector('td:has-text("Laura Díaz Paz")')
        await pg.click('td:has-text("Laura Díaz Paz")'); await pg.wait_for_selector('.historial'); await foto(pg, 'historial')
        await pg.click('.detalle >> button:has-text("Cerrar")')

        # 6) Rendiciones: Carlos (Tesorero) registra la entrega de Ana
        await pg.click('nav >> text=Rendiciones'); await pg.wait_for_selector('text=Registrar entrega')
        await pg.click('tr:has-text("Ana Pérez") >> text=Registrar entrega'); await foto(pg, 'rendicion-form')
        await pg.fill('#monto-rendicion', '2000'); await pg.click('button:has-text("Registrar $")')
        await pg.wait_for_selector('text=Rendición registrada'); await foto(pg, 'rendiciones')
        print('--- rendiciones ---'); print((await pg.inner_text('main'))[:600])

        # 7) Excel
        async with pg.expect_download() as d:
            await pg.click('text=Descargar Excel')
        dl = await d.value; ruta_x = os.path.join(DIR, 'prueba.xlsx'); await dl.save_as(ruta_x); print('excel:', dl.suggested_filename)

        # 8) Pastor (Consulta): ve todo pero no puede registrar ni corregir
        await pg.click('button:has-text("Salir")'); await ingresar(pg, 'daniel@mail.com')
        assert await pg.locator('nav >> text=QR de colaboradores').count() == 0
        await pg.click('nav >> text=Rendiciones'); await pg.wait_for_selector('text=Solo el Tesorero puede registrar')
        await pg.click('nav >> text=Inscripciones'); await pg.click('td:has-text("Mario Gómez")'); await pg.wait_for_selector('.detalle')
        assert await pg.locator('text=Anular inscripción').count() == 0
        await foto(pg, 'consulta')
        print('errores de página:', errores)
        await b.close()
        if errores: sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
