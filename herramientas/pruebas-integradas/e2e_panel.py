"""Prueba de punta a punta del panel (Etapa 4.1) con Supabase Auth y funciones simuladas."""
import asyncio, json, os, sys, time, base64, uuid
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
OUT = os.path.join(os.path.dirname(__file__), 'img_panel'); os.makedirs(OUT, exist_ok=True)
EVENTO = json.load(open('/home/claude/app-inscripciones/src/eventos/congreso-prueba.json'))

U = {'carlos@gmail.com': {'nombre': 'Carlos Coschiza', 'roles': ['responsable'], 'activo': True}}
CODIGOS = {}; TOKENS = {}; ACC = []; enviados = []

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
def jwt(email): return f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':str(uuid.uuid4()),'email':email,'role':'authenticated','exp':int(time.time())+3600,'aud':'authenticated'})}.firma"

def perfil(email):
    u = U.get(email)
    if not u or not u['activo']: return {'ok': False, 'error': 'no_habilitado'}
    return {'ok': True, 'email': email, 'nombre': u['nombre'], 'roles': sorted(u['roles'])}

def rpc(nombre, b, email):
    if nombre == 'correo_habilitado': return email_ok(b['p_email'])
    p = perfil(email) if email else {'ok': False}
    roles = p.get('roles', []) if p.get('ok') else []
    if nombre == 'mi_perfil': return p
    if nombre == 'panel_usuarios':
        if 'responsable' not in roles: return {'ok': False, 'error': 'sin_permiso'}
        return {'ok': True, 'usuarios': [dict(id=k, email=k, nombre=v['nombre'], activo=v['activo'], roles=sorted(v['roles'])) for k, v in U.items()]}
    if nombre == 'panel_guardar_usuario':
        if 'responsable' not in roles: return {'ok': False, 'error': 'sin_permiso'}
        e = b['p_email'].strip().lower()
        if e == email and 'responsable' not in b['p_roles']: return {'ok': False, 'error': 'ultimo_responsable'}
        U[e] = {'nombre': ' '.join(b['p_nombre'].split()), 'roles': b['p_roles'], 'activo': b['p_activo']}; return {'ok': True}
    if nombre == 'panel_datos_accesos':
        if 'organizador' not in roles: return {'ok': False, 'error': 'sin_permiso'}
        return {'ok': True, 'eventos': [{'id': EVENTO['id'], 'nombre': EVENTO['nombre'], 'fecha': EVENTO['fecha']}], 'colaboradores': [], 'accesos': ACC}
    if nombre == 'panel_crear_acceso':
        if 'organizador' not in roles: return {'ok': False, 'error': 'sin_permiso'}
        ACC.insert(0, dict(id=str(uuid.uuid4()), eventoId=b['p_evento'], colaborador=b['p_nombre'], tarea=b['p_tarea'], desde=b['p_desde'], hasta=b['p_hasta'], cerradoEn=None, dispositivos=0, inscripciones=0, creadoPor=email))
        return {'ok': True, 'codigo': 'ABCD-EFGH'}
    return {'ok': False, 'error': 'datos_invalidos'}

def email_ok(e): u = U.get(e.strip().lower()); return bool(u and u['activo'])

async def ruta(route):
    req = route.request; url = req.url; body = json.loads(req.post_data or '{}') if req.post_data else {}
    auth = req.headers.get('authorization', '')
    email = TOKENS.get(auth.replace('Bearer ', ''))
    if '/auth/v1/otp' in url:
        e = body.get('email')
        if not email_ok(e): return await route.fulfill(status=403, content_type='application/json', body=json.dumps({'code': 403, 'msg': 'Este correo no está habilitado.'}))
        CODIGOS[e] = '123456'; enviados.append(e)
        return await route.fulfill(status=200, content_type='application/json', body='{}')
    if '/auth/v1/verify' in url:
        e = body.get('email'); tok = body.get('token')
        if CODIGOS.get(e) != tok: return await route.fulfill(status=403, content_type='application/json', body=json.dumps({'code': 403, 'error_code': 'otp_expired', 'msg': 'Token has expired or is invalid'}))
        at = jwt(e); TOKENS[at] = e
        user = {'id': str(uuid.uuid4()), 'aud': 'authenticated', 'role': 'authenticated', 'email': e, 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-12T00:00:00Z'}
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'access_token': at, 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'refresh_token': 'r' + uuid.uuid4().hex, 'user': user}))
    if '/auth/v1/logout' in url:
        return await route.fulfill(status=204, body='')
    if '/auth/v1/user' in url:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': 'x', 'email': email, 'aud': 'authenticated', 'role': 'authenticated'}))
    if '/rest/v1/rpc/' in url:
        nombre = url.rsplit('/', 1)[1].split('?')[0]
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(rpc(nombre, body, email)))
    await route.continue_()

n = [0]
async def foto(pg, nombre):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png')

async def main():
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1100, 'height': 800}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        import re; await ctx.route(re.compile(r'supabase\.co/'), ruta)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errores.append('console: ' + m.text))
        await pg.goto(URL + '#panel'); await pg.wait_for_selector('text=Ingresar al panel'); await foto(pg, 'ingreso')
        await pg.fill('#correo-panel', 'intruso@gmail.com'); await pg.click('text=Enviarme el código')
        await pg.wait_for_selector('text=no está habilitado'); await foto(pg, 'ingreso-no-habilitado')
        await pg.fill('#correo-panel', 'Carlos@Gmail.com'); await pg.click('text=Enviarme el código')
        await pg.wait_for_selector('#codigo-panel'); await foto(pg, 'ingreso-codigo')
        await pg.fill('#codigo-panel', '111111'); await pg.click('button:has-text("Entrar")')
        await pg.wait_for_selector('text=no es correcto'); await foto(pg, 'ingreso-codigo-mal')
        await pg.fill('#codigo-panel', '123456'); await pg.click('button:has-text("Entrar")')
        await pg.wait_for_selector('text=Personas y roles'); await foto(pg, 'personas')
        # alta de una organizadora y un tesorero
        await pg.click('text=+ Agregar persona'); await pg.fill('#nombre-usuario', 'Ana Pérez'); await pg.fill('#correo-usuario', 'ana@mail.com')
        await pg.click('.rol-opcion:has-text("Organizador")'); await foto(pg, 'alta-persona')
        await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('td:has-text("ana@mail.com")')
        # Carlos se agrega Organizador a sí mismo
        await pg.click('tr:has-text("carlos@gmail.com") >> text=Modificar'); await pg.click('.rol-opcion:has-text("Organizador")')
        await pg.click('button:has-text("Guardar")'); await pg.wait_for_selector('tr:has-text("carlos@gmail.com") >> text=Organizador')
        await foto(pg, 'personas-lista')
        # recargar: sigue la sesión y ahora aparece la pestaña de QR
        await pg.reload(); await pg.wait_for_selector('text=QR de colaboradores')
        await pg.click('text=QR de colaboradores'); await pg.wait_for_selector('text=+ QR de cargador'); await foto(pg, 'qr')
        await pg.click('text=+ QR de cargador'); await pg.fill('#nombre-colaborador', 'Juan Gómez'); await pg.click('text=Crear QR')
        await pg.wait_for_selector('.qr-imagen'); await foto(pg, 'qr-creado')
        await pg.click('text=Listo'); await pg.wait_for_selector('text=Juan Gómez')
        # salir
        await pg.click('button:has-text("Salir")'); await pg.wait_for_selector('text=Ingresar al panel')
        # Ana entra: solo ve QR
        await pg.fill('#correo-panel', 'ana@mail.com'); await pg.click('text=Enviarme el código'); await pg.fill('#codigo-panel', '123456')
        await pg.click('button:has-text("Entrar")'); await pg.wait_for_selector('text=QR de colaboradores')
        assert await pg.locator('text=Personas y roles').count() == 0
        await foto(pg, 'ana-solo-qr')
        print('correos enviados:', enviados); print('errores:', errores)
        await b.close()
        if [e for e in errores if 'console' not in e]: sys.exit(1)

asyncio.run(main())
