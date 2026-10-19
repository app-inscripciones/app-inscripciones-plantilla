"""Simulacro de volumen (Etapa 5, parte automática): 3.000 inscripciones de 10 cargadores a la vez,
reenvíos (como cuando se corta internet a mitad de un envío), DNI repetidos, 3 celulares en la puerta
marcando a la misma gente, y tiempos del panel. Corre contra PostgREST local con todas las funciones del proyecto."""
import json, time, uuid, random, threading, urllib.request, sys, os, datetime, statistics
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pruebas-integradas'))
from e2e_real import jwt, PGRST

random.seed(7)
CARLOS = 'Bearer ' + jwt('carlos@gmail.com')
def rpc(nombre, cuerpo, auth=None):
    req = urllib.request.Request(f'{PGRST}/rpc/{nombre}', data=json.dumps(cuerpo).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', **({'Authorization': auth} if auth else {})})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=60) as r:
        datos = json.loads(r.read() or b'null')
    return datos, time.perf_counter() - t

CATS = {'ninos_2_5': (2, 5, 2500, 0), 'ninos_6_12': (6, 12, 2750, 0), 'preadolescentes': (13, 16, 3000, 1000),
        'adolescentes': (17, 20, 3250, 3000), 'jovenes': (21, 30, 3500, 3000), 'adultos': (31, 80, 3750, None)}
NOMBRES = ['Ana', 'Luis', 'María', 'José', 'Lucía', 'Pedro', 'Sofía', 'Juan', 'Carla', 'Diego', 'Elena', 'Tomás', 'Paula', 'Martín']
APELLIDOS = ['Gómez', 'Pérez', 'Díaz', 'Sosa', 'Romero', 'Benítez', 'Acosta', 'Ruiz', 'Medina', 'Fernández', 'López', 'Núñez']
HOY = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date().isoformat()

def inscripcion(cargador_n, k, dni):
    cat = random.choice(list(CATS)); emin, emax, matr, transp = CATS[cat]
    datos = {'nombre': f'{random.choice(NOMBRES)} {random.choice(APELLIDOS)} {cargador_n}-{k}', 'dni': str(dni),
             'telefono': f'3624{random.randint(100000, 999999)}', 'edad': str(random.randint(emin, emax)), 'iglesia': random.choice(['Central', 'Bethel', 'Esperanza']),
             'gluten': 'no', 'restricciones': 'no'}
    conceptos = [{'id': 'matricula', 'nombre': 'Matrícula', 'tramo': 'Precio promocional', 'monto': matr}]
    if transp is not None:
        datos['usa_transporte'] = random.choice(['si', 'no'])
        if datos['usa_transporte'] == 'si': conceptos.append({'id': 'transporte', 'nombre': 'Transporte', 'tramo': None, 'monto': transp})
    medio = random.choice(['efectivo', 'efectivo', 'transferencia', 'terminal'])
    ahora = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {'id': str(uuid.uuid4()), 'eventoId': 'congreso-prueba', 'creadaEn': ahora, 'diaCarga': HOY, 'categoria': cat, 'datos': datos,
            'conceptos': conceptos, 'monto': sum(c['monto'] for c in conceptos),
            'pago': {'medio': medio, **({'banco': 'Mercado Pago', 'ultimos6': 'ABC123'} if medio == 'transferencia' else {})}, 'dispositivo': f'cel-{cargador_n}'}

def main():
    t0 = time.perf_counter()
    desde = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)).isoformat()
    hasta = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5)).isoformat()
    tokens = {}
    for n in range(10):
        r, _ = rpc('panel_crear_acceso', {'p_evento': 'congreso-prueba', 'p_nombre': f'Cargador {n:02d}', 'p_tarea': 'cargar', 'p_desde': desde, 'p_hasta': hasta}, CARLOS)
        a, _ = rpc('activar_acceso', {'p_codigo': r['codigo'], 'p_dispositivo': f'dispositivo-cargador-{n:02d}'})
        tokens[n] = a['token']
    puerta = []
    for n in range(3):
        r, _ = rpc('panel_crear_acceso', {'p_evento': 'congreso-prueba', 'p_nombre': f'Puerta {n}', 'p_tarea': 'presentes', 'p_desde': desde, 'p_hasta': hasta}, CARLOS)
        a, _ = rpc('activar_acceso', {'p_codigo': r['codigo'], 'p_dispositivo': f'dispositivo-puerta-{n}'})
        puerta.append(a['token'])

    # 300 por cargador; 30 DNI repetidos a propósito (personas anotadas dos veces por distintos cargadores)
    dnis = random.sample(range(20_000_000, 50_000_000), 2970)
    dnis += random.sample(dnis[:1000], 30)
    random.shuffle(dnis)
    lotes = {n: [inscripcion(n, k, dnis[n * 300 + k]) for k in range(300)] for n in range(10)}
    # 5 con un monto que no corresponde (por ejemplo, un error de la app): se guardan igual, marcadas para revisar
    for n in range(5): lotes[n][0]['monto'] += 100
    tiempos, errores, respuestas = [], [], {}
    lock = threading.Lock()
    def cargador(n):
        for ins in lotes[n]:
            veces = 2 if random.random() < 0.1 else 1   # 10 %: el celular reenvía (se cortó internet antes de la respuesta)
            for _ in range(veces):
                try:
                    r, t = rpc('enviar_inscripcion_y_presente', {'p_token': tokens[n], 'p': ins})
                    with lock:
                        tiempos.append(t)
                        if not r.get('ok'): errores.append(r)
                        else: respuestas.setdefault(ins['id'], set()).add(r['numeroOrden'])
                except Exception as e:
                    with lock: errores.append(str(e))
    hilos = [threading.Thread(target=cargador, args=(n,)) for n in range(10)]
    t1 = time.perf_counter(); [h.start() for h in hilos]; [h.join() for h in hilos]; t_carga = time.perf_counter() - t1
    print(f'Inscripciones: {len(tiempos)} envíos en {t_carga:.1f} s · mediana {statistics.median(tiempos)*1000:.0f} ms · p95 {sorted(tiempos)[int(len(tiempos)*.95)]*1000:.0f} ms · errores {len(errores)}')
    reenvio_mismo_numero = all(len(v) == 1 for v in respuestas.values())
    print(f'  ids distintos recibidos: {len(respuestas)} · reenvíos con el mismo número de orden: {reenvio_mismo_numero}')

    # Puerta: cada celular baja la lista y marca 1.000 personas; se superponen (las mismas personas en varios celulares)
    lista, t = rpc('lista_puerta', {'p_token': puerta[0], 'p_desde': None})
    tam = len(json.dumps(lista))
    print(f'Puerta: lista de {len(lista["inscripciones"])} inscripciones en {t*1000:.0f} ms ({tam/1024:.0f} KB)')
    ids = [i['id'] for i in lista['inscripciones']]
    elegidos = random.sample(ids, 1500)
    def controlador(n):
        mios = elegidos[n * 500: n * 500 + 1000]   # se pisan 500 con el siguiente
        for i in range(0, len(mios), 100):
            marcas = [{'id': str(uuid.uuid4()), 'inscripcionId': x, 'instancia': 'llegada', 'persona': '', 'marcadaEn': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'estado': 'presente'} for x in mios[i:i + 100]]
            r, t = rpc('enviar_marcas', {'p_token': puerta[n], 'p_marcas': marcas})
            with lock:
                if not r.get('ok'): errores.append(r)
    hilos = [threading.Thread(target=controlador, args=(n,)) for n in range(3)]
    t1 = time.perf_counter(); [h.start() for h in hilos]; [h.join() for h in hilos]
    print(f'  3 celulares marcaron 3.000 veces (1.500 personas distintas) en {time.perf_counter()-t1:.1f} s')

    # Panel
    for nombre, cuerpo in [('panel_resumen', {'p_evento': 'congreso-prueba'}), ('panel_inscripciones', {'p_evento': 'congreso-prueba', 'p_buscar': 'gomez'}),
                           ('panel_inscripciones', {'p_evento': 'congreso-prueba', 'p_filtro': 'revisar'}), ('panel_presentes', {'p_evento': 'congreso-prueba'}),
                           ('panel_exportar', {'p_evento': 'congreso-prueba'})]:
        r, t = rpc(nombre, cuerpo, CARLOS)
        print(f'Panel {nombre}{" " + str(cuerpo.get("p_buscar") or cuerpo.get("p_filtro") or "")}: {t*1000:.0f} ms ({len(json.dumps(r))/1024:.0f} KB)')
        if nombre == 'panel_resumen': resumen = r
        if nombre == 'panel_presentes': presentes = r
        if nombre == 'panel_exportar': exportar = r
    print('Resumen:', {k: resumen.get(k) for k in ['inscriptos', 'posiblesDuplicados', 'fueraDeHorario', 'montoARevisar', 'paraRevisar']}, 'dinero', resumen.get('dinero'))
    print('Presentes:', [(i['nombre'], i['presentes']) for i in presentes['porInstancia']])
    print(f'Errores totales: {len(errores)}' + (f' · ejemplo: {errores[0]}' if errores else ''))
    json.dump(exportar, open('/tmp/exportar_carga.json', 'w'))
    print(f'Total {time.perf_counter()-t0:.0f} s')

main()
