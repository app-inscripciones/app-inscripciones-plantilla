"""Prueba integrada (Etapa 9, D58): estado del sistema y avisos en el panel.
1) Sin revisiones: no hay cartel de alarma; «Estado del sistema» dice que todavía no corrió.
2) Revisión con el respaldo fallado: cartel 🔴 en el Resumen → «Ver qué hacer» → detalle con qué hacer.
3) Revisión vieja (hace 3 días): el panel detecta solo que la revisión dejó de correr.
4) Revisión con el respaldo bien: «Comprobar el respaldo diario» de los Primeros pasos se marca solo.
Correr con la base recién cargada (con 016)."""
import asyncio, os, sys, re, subprocess, json
sys.path.insert(0, os.path.dirname(__file__))
from e2e_real import ruta, ingresar
from playwright.async_api import async_playwright

DIR = os.path.dirname(__file__)
OUT = os.path.join(DIR, 'img_estado'); os.makedirs(OUT, exist_ok=True)
n = [0]
async def foto(pg, nombre):
    n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f'{OUT}/{n[0]:02d}-{nombre}.png', full_page=True)
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()
def revision(resultados, hace='0 hours'):
    j = json.dumps(resultados).replace("'", "''")
    sql(f"insert into revisiones (cuando, resultados, correo) values (now() - interval '{hace}', '{j}'::jsonb, 'Aviso enviado a carlos@gmail.com')")

OK = [{'id': 'base', 'estado': 'ok', 'titulo': 'Base de datos', 'detalle': 'Responde normalmente.'},
      {'id': 'respaldo', 'estado': 'ok', 'titulo': 'Respaldo diario', 'detalle': 'El último salió bien el 13/10/26 03:20.'},
      {'id': 'correo', 'estado': 'ok', 'titulo': 'Correo de la institución', 'detalle': 'El Gmail puede mandar correos.'}]
MAL = [OK[0], {'id': 'respaldo', 'estado': 'problema', 'titulo': 'El último respaldo falló', 'detalle': 'Fue el 13/10/26 03:20.',
               'queHacer': 'GitHub → «Actions» → «Respaldo diario» → abrí la ejecución en rojo ❌. Después tocá «Run workflow».'},
       {'id': 'llave_cloudflare', 'estado': 'aviso', 'titulo': 'La llave de Cloudflare vence en 20 días', 'detalle': 'Vence el 2/11/26.', 'queHacer': 'Creá una llave nueva.'}, OK[2]]

async def main():
    sql('delete from revisiones')
    errores = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pc = await b.new_context(viewport={'width': 1100, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        await pc.route(re.compile(r'supabase\.co/'), ruta)
        pg = await pc.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
        await ingresar(pg, 'carlos@gmail.com')
        # 1) sin revisiones
        await pg.wait_for_selector('text=Primeros pasos')
        assert await pg.locator('text=El sistema necesita atención').count() == 0
        await pg.click('nav >> text=Estado del sistema'); await pg.wait_for_selector('text=Todavía no corrió la revisión diaria'); await foto(pg, 'sin-revision')
        # 2) respaldo fallado
        revision(MAL)
        await pg.reload(); await pg.wait_for_selector('text=El sistema necesita atención: 1 problema y 1 aviso'); await foto(pg, 'cartel-resumen')
        await pg.click('text=Ver qué hacer'); await pg.wait_for_selector('.item-estado.problema >> text=El último respaldo falló')
        assert 'Qué hacer' in await pg.inner_text('.item-estado.problema')
        assert 'Aviso enviado' in await pg.inner_text('.resumen-estado')
        await foto(pg, 'estado-problema')
        # 3) revisión vieja
        sql('delete from revisiones'); revision(OK, '80 hours')
        await pg.click('#revisar-ahora'); await pg.wait_for_selector('text=La revisión diaria no corre hace 3 días'); await foto(pg, 'revision-vieja')
        # 4) todo bien: el paso del respaldo se marca solo
        sql('delete from revisiones'); revision(OK)
        await pg.reload(); await pg.click('nav >> text=Estado del sistema'); await pg.wait_for_selector('text=Todo en orden'); await foto(pg, 'todo-bien')
        await pg.click('nav >> text=Resumen'); await pg.wait_for_selector('text=Primeros pasos')
        fila = await pg.inner_text('li:has-text("Comprobar el respaldo diario")')
        assert 'hecho' in fila, fila
        assert await pg.locator('text=El sistema necesita atención').count() == 0
        await b.close()
    assert not errores, errores
    print('OK: estado del sistema y avisos en el panel')

asyncio.run(main())
