"""Simulacro del cupo presencial (R18, D57) con 10 cargadores a la vez.
Evento híbrido con cupo de 100 personas y cierre automático al 100 %. Cada cargador manda 30 inscripciones,
la mitad presenciales (150 presenciales en total: más que el cupo) y el 10 % reenviadas (como cuando se corta
internet a mitad de un envío). 8 cargadores tienen internet: cada 3 envíos consultan su estado y, cuando se
cierran los presenciales, pasan a «Virtual» (como el celular real). 2 están sin señal: siguen cargando presenciales.
Controla: nada perdido ni duplicado, el dinero exacto, un solo cierre automático, todas las presenciales cargadas
después del cierre marcadas «sobre el cupo», y cuántas presenciales entraron de más en la carrera.
Uso: python3 cupo.py   (contra PostgREST local; ver LEEME.md)"""
import json, uuid, random, threading, subprocess, datetime, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from carga import rpc, CARLOS

random.seed(11)
DIR = os.path.dirname(os.path.abspath(__file__))
def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'real', '-At', '-c', q], capture_output=True, text=True, check=True).stdout.strip()

def definicion():
    fecha = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
    js = subprocess.run(['node', os.path.join(DIR, '..', 'pruebas-integradas', 'defmod.mjs'), 'hibrido', fecha], capture_output=True, text=True, check=True).stdout
    d = json.loads(js)
    d['nombre'] = f"Simulacro de cupo {uuid.uuid4().hex[:4]}"
    d['cupoPresencial'] = 100
    d['cierrePresencialPct'] = 100
    return d

def main():
    d = definicion()
    b, _ = rpc('panel_guardar_borrador', {'p_id': None, 'p_borrador': d}, CARLOS)
    a, _ = rpc('panel_abrir_evento', {'p_id': b['id'], 'p_definicion': d}, CARLOS)
    ev = a['id']
    ahora = datetime.datetime.now(datetime.timezone.utc)
    desde, hasta = (ahora - datetime.timedelta(hours=1)).isoformat(), (ahora + datetime.timedelta(hours=5)).isoformat()
    tokens = {}
    for n in range(10):
        r, _ = rpc('panel_crear_acceso', {'p_evento': ev, 'p_nombre': f'Cupo {n:02d}', 'p_tarea': 'cargar', 'p_desde': desde, 'p_hasta': hasta}, CARLOS)
        x, _ = rpc('activar_acceso', {'p_codigo': r['codigo'], 'p_dispositivo': f'disp-cupo-{ev[-6:]}-{n:02d}'})
        tokens[n] = x['token']
    sin_senal = {8, 9}
    enviados, errores, numeros = {}, [], {}
    lock = threading.Lock()

    def cargador(n):
        cerradas = False
        for k in range(30):
            if n not in sin_senal and k % 3 == 0:
                e, _ = rpc('estado_sesion', {'p_token': tokens[n]})
                cerradas = bool((e.get('presenciales') or {}).get('cerradasEn'))
            quiere = 'presencial' if k % 2 == 0 else 'virtual'
            modalidad = 'virtual' if (quiere == 'presencial' and cerradas) else quiere   # el celular conectado no ofrece «Presencial»
            monto = 5000 if modalidad == 'presencial' else 2000
            ins = {'id': str(uuid.uuid4()), 'creadaEn': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'diaCarga': datetime.date.today().isoformat(),
                   'datos': {'nombre': f'Persona {n}-{k}', 'modalidad': modalidad, 'dni': str(20_000_000 + n * 1000 + k), 'telefono': f'3624{n:02d}{k:04d}'},
                   'conceptos': [{'id': modalidad, 'monto': monto}], 'monto': monto, 'pago': {'medio': 'efectivo'}}
            for _ in range(2 if random.random() < 0.1 else 1):
                try:
                    r, _ = rpc('enviar_inscripcion', {'p_token': tokens[n], 'p': ins})
                    with lock:
                        if r.get('ok'): enviados[ins['id']] = ins; numeros.setdefault(ins['id'], set()).add(r['numeroOrden'])
                        else: errores.append(r)
                except Exception as e:  # noqa: BLE001
                    with lock: errores.append(str(e))

    hilos = [threading.Thread(target=cargador, args=(n,)) for n in range(10)]
    for h in hilos: h.start()
    for h in hilos: h.join()

    base = int(sql(f"select count(*) from inscripciones where evento_id = '{ev}'"))
    dinero = int(sql(f"select coalesce(sum(monto), 0) from inscripciones where evento_id = '{ev}'"))
    cierres = int(sql(f"select count(*) from auditoria where accion = 'cerrar_presenciales' and entidad_id = '{ev}'"))
    cerradas_en = sql(f"select presenciales_cerradas_en from eventos where id = '{ev}'")
    pres = int(sql(f"select count(*) from inscripciones where evento_id = '{ev}' and datos ->> 'modalidad' = 'presencial'"))
    marcadas = int(sql(f"select count(*) from inscripciones where evento_id = '{ev}' and sobre_cupo"))
    sin_marca = int(sql(f"""select count(*) from inscripciones i join eventos e on e.id = i.evento_id
        where i.evento_id = '{ev}' and i.datos ->> 'modalidad' = 'presencial' and i.creada_en_local > e.presenciales_cerradas_en and not i.sobre_cupo"""))
    antes_del_cierre = int(sql(f"""select count(*) from inscripciones i join eventos e on e.id = i.evento_id
        where i.evento_id = '{ev}' and i.datos ->> 'modalidad' = 'presencial' and i.creada_en_local <= e.presenciales_cerradas_en"""))
    montos_revisar = int(sql(f"select count(*) from inscripciones where evento_id = '{ev}' and monto_revisar"))
    print(f'Evento: {ev}')
    print(f'Inscripciones enviadas (sin contar reenvíos): {len(enviados)} · en la base: {base} · errores: {len(errores)}')
    print(f'Reenvíos con el mismo número de orden: {all(len(v) == 1 for v in numeros.values())}')
    print(f'Dinero: enviado ${sum(i["monto"] for i in enviados.values()):,} · en la base ${dinero:,}'.replace(',', '.'))
    print(f'Cierres automáticos: {cierres} (a las {cerradas_en})')
    print(f'Presenciales en la base: {pres} (cupo 100) · cargadas antes del cierre: {antes_del_cierre} · marcadas «sobre el cupo»: {marcadas}')
    print(f'Presenciales cargadas después del cierre SIN marcar: {sin_marca}')
    print(f'Montos «para revisar» (precio por modalidad): {montos_revisar}')
    assert not errores, errores[:3]
    assert base == len(enviados)
    assert all(len(v) == 1 for v in numeros.values())
    assert dinero == sum(i['monto'] for i in enviados.values())
    assert cierres == 1
    assert sin_marca == 0
    assert montos_revisar == 0
    assert marcadas > 0, 'los celulares sin señal tendrían que haber cargado presenciales después del cierre'
    print('OK: simulacro del cupo')

if __name__ == '__main__':
    main()
