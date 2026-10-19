import Ayuda from './Ayuda.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { leerPuerta, marcar, deshacer, sincronizarPuerta, buscar, marcaVigente, contarPresentes, instanciaPropuesta, pendientesPuerta } from '../datos/puerta.js';
import { formatoFechaHora } from '../logica/fechas.js';

// Pantalla de la puerta (Etapa 4B): buscar por nombre o DNI y marcar «Presente» con un toque.

const CADA_CUANTO = 10 * 1000; // con internet, se comparten las marcas cada 10 segundos
const hora = (iso) => formatoFechaHora(iso).split(' ')[1];

function nombreDe(evento, ins, persona) {
  if (evento.unidad === 'grupo') {
    if (persona) return ((ins.integrantes || []).find((x) => x.id === persona) || {}).nombre || '?';
    return ins.datos.nombre_grupo || 'Sin nombre';
  }
  if (evento.unidad === 'pareja') {
    if (persona === 'hombre') return ins.datos.hombre || '?';
    if (persona === 'mujer') return ins.datos.mujer || '?';
    return `${ins.datos.hombre || '?'} y ${ins.datos.mujer || '?'}`;
  }
  return ins.datos.nombre || 'Sin nombre';
}

export default function Puerta({ sesion, evento, enLinea, soloEnvio, alTerminar }) {
  const [datos, setDatos] = useState({ inscripciones: [], marcas: [], asistencia: null });
  const [consulta, setConsulta] = useState('');
  const [instanciaId, setInstanciaId] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [aviso, setAviso] = useState(null); // { texto, marcaId }
  const [pendientes, setPendientes] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [error, setError] = useState('');
  const buscador = useRef(null);
  const temporizador = useRef(null);

  const recargar = useCallback(async () => {
    const d = await leerPuerta();
    setDatos(d);
    setPendientes(await pendientesPuerta());
    return d;
  }, []);

  const sincronizar = useCallback(async () => {
    const r = await sincronizarPuerta(sesion.sesionId);
    if (r.error === 'sesion_invalida') setError('Este celular ya no tiene un acceso válido para la puerta. Las marcas que ya hiciste quedan guardadas: no borres la app. Pedile al organizador un QR nuevo de control de presentes.');
    else setError('');
    const d = await recargar();
    setPrimeraCarga(false);
    return d;
  }, [sesion.sesionId, recargar]);

  useEffect(() => {
    recargar().then((d) => { if (d.inscripciones.length) setPrimeraCarga(false); });
    sincronizar();
    const t = setInterval(() => { if (navigator.onLine) sincronizar(); }, CADA_CUANTO);
    const alVolver = () => sincronizar();
    window.addEventListener('online', alVolver);
    return () => { clearInterval(t); window.removeEventListener('online', alVolver); };
  }, [recargar, sincronizar]);

  const asistencia = datos.asistencia || evento.asistencia || {};
  const instancias = asistencia.instancias && asistencia.instancias.length
    ? asistencia.instancias : [{ id: 'llegada', nombre: 'Llegada', fecha: evento.fecha }];
  const porPersona = (evento.unidad === 'pareja' || evento.unidad === 'grupo') && asistencia.modoPareja === 'individual';
  const personasDe = (ins) => (evento.unidad === 'grupo' ? (ins.integrantes || []).map((x) => x.id) : ['hombre', 'mujer']);
  useEffect(() => {
    if (!instanciaId || !instancias.some((i) => i.id === instanciaId)) setInstanciaId(instanciaPropuesta(instancias).id);
  }, [instancias, instanciaId]);
  const instancia = instancias.find((i) => i.id === instanciaId) || instancias[0];

  // R18: en los eventos híbridos, los que participan en forma virtual no se esperan en la puerta.
  const lista = useMemo(() => datos.inscripciones.filter((i) => !i.virtual), [datos.inscripciones]);
  const anuladas = useMemo(() => new Set(lista.filter((i) => i.anulada).map((i) => i.id)), [lista]);
  const esperados = porPersona
    ? lista.filter((i) => !i.anulada).reduce((s, i) => s + (evento.unidad === 'grupo' ? (i.integrantes || []).length : 2), 0)
    : lista.length - anuladas.size;
  const presentes = contarPresentes(datos.marcas, instancia.id, porPersona, anuladas);
  const resultados = useMemo(() => buscar(lista, consulta, 25), [lista, consulta]);
  const categoria = (id) => ((evento.categorias || []).find((c) => c.id === id) || {}).nombre;

  const tocarPresente = async (ins, persona = '') => {
    const m = await marcar({ inscripcionId: ins.id, instancia: instancia.id, persona, sesionId: sesion.sesionId, colaborador: sesion.colaborador });
    if (navigator.vibrate) navigator.vibrate(40);
    clearTimeout(temporizador.current);
    setAviso({ texto: `✓ ${nombreDe(evento, ins, persona)}: presente`, marcaId: m.id });
    temporizador.current = setTimeout(() => setAviso(null), 8000);
    setConsulta('');
    await recargar();
    if (buscador.current) buscador.current.focus();
    if (navigator.onLine) sincronizar();
  };
  const tocarDeshacer = async () => {
    if (!aviso) return;
    await deshacer(aviso.marcaId);
    clearTimeout(temporizador.current);
    setAviso({ texto: 'Se deshizo la marca.', marcaId: null });
    temporizador.current = setTimeout(() => setAviso(null), 3000);
    await recargar();
    if (navigator.onLine) sincronizar();
  };

  // --------- Terminó el horario: solo envío ---------
  if (soloEnvio) {
    return (
      <main className="contenido">
        <div className="aviso-fin">{soloEnvio === 'cerrado' ? '🔒 El organizador cerró tu acceso.' : '⏱️ Terminó tu horario.'} Ya no se pueden marcar presentes.</div>
        {pendientes > 0 ? (
          <>
            <p>Quedan <strong>{pendientes}</strong> marcas sin enviar. Conectate a internet: no cierres ni borres la app.</p>
            <button className="boton principal grande" disabled={!enLinea} onClick={sincronizar}>{enLinea ? 'Enviar ahora' : 'Sin internet: conectate para enviar'}</button>
          </>
        ) : (
          <>
            <p>🟢 Todas tus marcas llegaron a la base central. ¡Gracias por colaborar!</p>
            <button className="boton secundario" onClick={alTerminar}>Terminar y borrar la lista de este celular</button>
          </>
        )}
      </main>
    );
  }

  const fila = (ins) => {
    const proc = ins.procedencia ? ` · ${ins.procedencia}` : '';
    const cat = categoria(ins.categoria);
    const dni = evento.unidad === 'grupo'
      ? (ins.integrantes || []).map((x) => `${x.nombre || '?'}${x.responsable ? ' ⭐' : ''}`).join(' · ')
      : ins.datos.dni ? `DNI ${ins.datos.dni}` : ins.datos.telefono ? `Tel. ${ins.datos.telefono}` : `Nº ${ins.n}`;
    if (ins.anulada) {
      return (
        <li key={ins.id} className="fila-puerta anulada">
          <div className="quien"><div className="nombre">{nombreDe(evento, ins)}</div><div className="mas">{dni}{cat ? ` · ${cat}` : ''}</div></div>
          <div className="estado-puerta rojo">Anulada: consultar al organizador</div>
        </li>
      );
    }
    const personas = porPersona ? personasDe(ins) : [''];
    const vigentes = personas.map((p) => marcaVigente(datos.marcas, ins.id, instancia.id, p));
    const todos = vigentes.every(Boolean);
    return (
      <li key={ins.id} className={`fila-puerta ${todos ? 'presente' : ''}`}>
        <div className="quien">
          <div className="nombre">{nombreDe(evento, ins)}{evento.unidad === 'grupo' ? ` (${(ins.integrantes || []).length})` : ''}</div>
          <div className="mas">{dni}{cat ? ` · ${cat}` : ''}{proc}</div>
        </div>
        <div className="botones-puerta">
          {personas.map((p, k) => (vigentes[k] ? (
            <div key={p || 'uno'} className="estado-puerta verde">
              ✓ {porPersona ? nombreDe(evento, ins, p).split(' ')[0] : 'Presente'}
              <small>{hora(vigentes[k].marcadaEn)} · {vigentes[k].marcadoPor === sesion.colaborador ? 'vos' : vigentes[k].marcadoPor}</small>
            </div>
          ) : (
            <button key={p || 'uno'} className="boton-presente" onClick={() => tocarPresente(ins, p)}>
              ✓ {porPersona ? nombreDe(evento, ins, p).split(' ')[0] : 'Presente'}
            </button>
          )))}
        </div>
      </li>
    );
  };

  return (
    <main className="contenido puerta">
      {error && <div className="error-grande">{error}</div>}
      <div className="instancia-actual">
        <span>Tomando: <strong>{instancia.nombre}</strong></span>
        {instancias.length > 1 && <button className="enlace" onClick={() => setEligiendo(!eligiendo)}>Cambiar</button>}
      </div>
      {eligiendo && (
        <div className="opciones">
          {instancias.map((i) => (
            <button key={i.id} className={`opcion ${i.id === instancia.id ? 'elegida' : ''}`} onClick={() => { setInstanciaId(i.id); setEligiendo(false); }}>
              {i.nombre}<small>{i.fecha.split('-').reverse().join('/')}</small>
            </button>
          ))}
        </div>
      )}
      <div className="contador-puerta">
        <span>Presentes</span>
        <strong>{presentes} <small>de {esperados}</small></strong>
      </div>
      <input ref={buscador} id="buscar-puerta" className="buscador-puerta" value={consulta} onChange={(e) => setConsulta(e.target.value)}
        placeholder="Nombre, apellido o DNI" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" autoFocus />
      {primeraCarga && datos.inscripciones.length === 0 ? (
        <p className="ayuda">{enLinea ? 'Bajando la lista de inscriptos…' : 'Para bajar la lista de inscriptos hace falta internet (una vez).'}</p>
      ) : consulta.trim().length < 2 ? (
        <>
          <p className="ayuda">Escribí al menos 2 letras o números. {pendientes > 0 ? `🟡 ${pendientes} marcas sin enviar.` : ''}</p>
          {consulta.trim().length === 0 && <Ayuda tema="puerta" />}
        </>
      ) : resultados.length === 0 ? (
        <div className="advertencia">No aparece en la lista. Mandala a un cargador para que la inscriba{enLinea ? '' : ' (o conectate a internet: puede ser una inscripción nueva)'}.</div>
      ) : (
        <ul className="lista-puerta">{resultados.map(fila)}</ul>
      )}
      {aviso && (
        <div className="toast" role="status">
          <span>{aviso.texto}</span>
          {aviso.marcaId && <button className="enlace claro" onClick={tocarDeshacer}>Deshacer</button>}
        </div>
      )}
    </main>
  );
}
