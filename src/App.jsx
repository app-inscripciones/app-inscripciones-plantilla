import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import Ayuda from './pantallas/Ayuda.jsx';
import Marca from './pantallas/Marca.jsx';
import { db, inscripcionesDelEvento, leerAjuste, guardarAjuste, pedirAlmacenamientoPersistente, resumenCargador } from './datos/db.js';
import Formulario from './pantallas/Formulario.jsx';
import Lista from './pantallas/Lista.jsx';
import Resumen from './pantallas/Resumen.jsx';
import Activar from './pantallas/Activar.jsx';
// El panel se carga aparte: el celular del cargador no los necesita para empezar.
const Panel = lazy(() => import('./pantallas/Panel.jsx'));
const QueHagoSi = lazy(() => import('./pantallas/QueHagoSi.jsx'));
// D62: página del participante (QR de autopresente) y pantalla con el QR que cambia.
const Autopresente = lazy(() => import('./pantallas/Autopresente.jsx'));
const PantallaAutopresente = lazy(() => import('./pantallas/PantallaAutopresente.jsx'));
const cargandoPantalla = <div className="contenido">Cargando…</div>;
import { formatoHorario } from './logica/fechas.js';
import { sincronizar, recuperarEnvioInterrumpido, MENSAJES_ERROR } from './datos/sincronizacion.js';
import { leerSesion, estadoAcceso, actualizarEstadoSesion, terminarAcceso, eventosDeSesion, eventoDisponible } from './datos/sesion.js';
import ElegirEvento from './pantallas/ElegirEvento.jsx';
import { borrarPuerta } from './datos/puerta.js';
import Puerta from './pantallas/Puerta.jsx';
import { BotonDejarAcceso, CambiarAcceso, AvisoPrimeraVez } from './pantallas/DejarAcceso.jsx';

const CADA_CUANTO_REINTENTAR = 60 * 1000; // 1 minuto

function useConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    window.addEventListener('online', si);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', si);
      window.removeEventListener('offline', no);
    };
  }, []);
  return enLinea;
}

// Reloj que se actualiza cada 30 segundos (para saber cuándo empieza o termina el horario).
function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

function codigoDeLaDireccion() {
  try {
    return new URLSearchParams(window.location.search).get('a') || '';
  } catch {
    return '';
  }
}

function useRuta() {
  const [ruta, setRuta] = useState(() => window.location.hash.replace('#', ''));
  useEffect(() => {
    const f = () => setRuta(window.location.hash.replace('#', ''));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta;
}

export default function App() {
  const ruta = useRuta();
  // /#organizar era la pantalla provisoria con clave (D37), dada de baja (D72): ahora abre el panel.
  if (ruta === 'panel' || ruta === 'organizar') return <Suspense fallback={cargandoPantalla}><Panel /></Suspense>;
  if (ruta.startsWith('autopresente/')) return <Suspense fallback={cargandoPantalla}><Autopresente codigo={ruta.slice('autopresente/'.length)} /></Suspense>;
  if (ruta.startsWith('pantalla-autopresente/')) return <Suspense fallback={cargandoPantalla}><PantallaAutopresente pantalla={ruta.slice('pantalla-autopresente/'.length)} /></Suspense>;
  if (ruta === 'ayuda') {
    return (
      <>
        <header className="encabezado"><Marca titulo="Ayuda" /></header>
        <Suspense fallback={cargandoPantalla}><QueHagoSi /></Suspense>
      </>
    );
  }
  return <AppColaborador />;
}

function AppColaborador() {
  const enLinea = useConexion();
  const ahora = useAhora();
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState(null);
  const [pantalla, setPantalla] = useState('inicio');
  const [inscripciones, setInscripciones] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [aviso, setAviso] = useState('');
  const [persistente, setPersistente] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [ultimaSinc, setUltimaSinc] = useState(null);
  const [pendientesTotales, setPendientesTotales] = useState(0);
  // D64: si el celular ya tiene un acceso y se abre la app con otro QR, se pregunta qué hacer.
  const [otroQR, setOtroQR] = useState(() => !!codigoDeLaDireccion());
  // D66: aviso de la primera vez (solo en accesos reales, no en la práctica).
  const [primeraVez, setPrimeraVez] = useState(false);

  const evento = sesion ? sesion.evento : null;
  // D77: un QR de carga puede tener varios eventos; antes de cada inscripción se elige uno.
  const eventos = eventosDeSesion(sesion);
  const varios = eventos.length > 1;
  const [eventoElegido, setEventoElegido] = useState(null);
  const eventoFormulario = varios ? eventos.find((e) => e.id === eventoElegido) || null : evento;
  const idsEventos = eventos.map((e) => e.id).join('|');
  const cargador = sesion ? sesion.colaborador : null;
  const estado = estadoAcceso(sesion, ahora);

  const recargar = useCallback(async () => {
    setUltimaSinc(await leerAjuste('ultimaSincronizacion'));
    setPendientesTotales(await db.inscripciones.where('estado').anyOf('pendiente', 'enviando', 'error').count());
    if (!idsEventos || !cargador) return;
    const ids = idsEventos.split('|');
    const listas = await Promise.all(ids.map((id) => inscripcionesDelEvento(id)));
    setInscripciones(listas.flat().sort((a, b) => String(b.creadaEn).localeCompare(String(a.creadaEn))));
    setResumen(await Promise.all(ids.map(async (id) => ({ eventoId: id, resumen: await resumenCargador(id, cargador) }))));
  }, [idsEventos, cargador]);

  const enviarAhora = useCallback(async () => {
    // Sin red no tiene sentido intentar: se envía solo cuando vuelve internet (evento «online»).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { recargar(); return; }
    setEnviando(true);
    try {
      await sincronizar();
      setSesion(await actualizarEstadoSesion());
    } finally {
      setEnviando(false);
      recargar();
    }
  }, [recargar]);

  useEffect(() => {
    (async () => {
      setSesion(await leerSesion());
      setPersistente(await pedirAlmacenamientoPersistente());
      await recuperarEnvioInterrumpido();
      setCargando(false);
    })();
  }, []);

  // Envío automático: al abrir, al volver internet y cada minuto.
  useEffect(() => {
    if (cargando) return undefined;
    enviarAhora();
    const alVolver = () => enviarAhora();
    window.addEventListener('online', alVolver);
    const reloj = setInterval(() => { if (navigator.onLine) enviarAhora(); }, CADA_CUANTO_REINTENTAR);
    return () => {
      window.removeEventListener('online', alVolver);
      clearInterval(reloj);
    };
  }, [cargando, enviarAhora]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Si se vence el horario mientras está en el formulario o la lista, vuelve al inicio.
  useEffect(() => {
    // D46: si cierran las inscripciones mientras está completando una, la puede terminar (llega marcada para revisar).
    if (estado === 'inscripciones_cerradas' && pantalla === 'formulario') return;
    if (estado !== 'vigente' && pantalla !== 'inicio' && pantalla !== 'resumen') setPantalla('inicio');
  }, [estado, pantalla]);

  if (cargando) return <div className="contenido">Cargando…</div>;

  const encabezado = (
    <header className="encabezado">
      <Marca titulo={varios ? `${eventos.length} eventos` : evento ? evento.nombre : null} />
      <span className={`conexion ${enLinea ? 'si' : 'no'}`}>{enLinea ? 'Con internet' : 'Sin internet'}</span>
    </header>
  );

  const alActivar = async (s) => {
    setSesion(s);
    setPantalla('inicio');
    setAviso('');
    setOtroQR(false);
    if (window.location.search) window.history.replaceState(null, '', '/');
    enviarAhora();
    if (s && s.evento && !s.evento.practica && !(await leerAjuste('avisoPrimeraVezVisto'))) setPrimeraVez(true);
  };
  const cerrarPrimeraVez = async () => { setPrimeraVez(false); await guardarAjuste('avisoPrimeraVezVisto', new Date().toISOString()); };
  const alDejar = () => { setSesion(null); setPantalla('inicio'); setOtroQR(false); recargar(); };
  const avisoPrimeraVez = primeraVez ? <AvisoPrimeraVez alCerrar={cerrarPrimeraVez} /> : null;

  if (sesion && otroQR && pantalla !== 'activar') {
    const pendientesAcceso = inscripciones.filter((i) => ['pendiente', 'enviando', 'error'].includes(i.estado)).length;
    return (
      <>
        {encabezado}
        <CambiarAcceso sesion={sesion} sinEnviar={pendientesAcceso}
          alSeguir={() => { setOtroQR(false); window.history.replaceState(null, '', '/'); }}
          alCambiar={() => { setOtroQR(false); setSesion(null); setPantalla('inicio'); recargar(); }} />
      </>
    );
  }

  if (!sesion || pantalla === 'activar') {
    return (
      <>
        {encabezado}
        {pendientesTotales > 0 && (
          <div className="franja pendiente" role="status">
            🟡 Hay {pendientesTotales} inscripciones de un acceso anterior sin enviar. Se envían solas cuando hay internet.
          </div>
        )}
        <Activar codigoInicial={codigoDeLaDireccion()} alActivar={alActivar} />
      </>
    );
  }

  const sinEnviar = inscripciones.filter((i) => i.estado === 'pendiente' || i.estado === 'enviando').length;
  const conError = inscripciones.filter((i) => i.estado === 'error');
  const volver = () => {
    setPantalla('inicio');
    recargar();
  };
  const horaUltima = ultimaSinc
    ? new Date(ultimaSinc).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;
  // D56: evento de práctica. Se ve en todas las pantallas del celular.
  const franjaPractica = evento && evento.practica ? (
    <div className="franja practica" role="note">
      🧪 PRÁCTICA: nada de esto es real{sesion.tarea === 'cargar' ? '. Cobrá de mentira y no entregues dinero' : ''}. Se borra solo.
    </div>
  ) : null;
  const franjas = (
    <>
      {franjaPractica}
      {conError.length > 0 && (
        <div className="franja alerta" role="alert">
          🔴 {conError.length} {conError.length === 1 ? 'inscripción no se pudo enviar' : 'inscripciones no se pudieron enviar'}.{' '}
          {MENSAJES_ERROR[conError[0].error] || MENSAJES_ERROR.datos_invalidos}
        </div>
      )}
      {sinEnviar > 0 && (
        <div className="franja pendiente" role="status">
          🟡 {sinEnviar} sin enviar. Se envían solas cuando hay internet.
          <button className="boton-chico" onClick={enviarAhora} disabled={enviando || !enLinea}>
            {enviando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      )}
      {sinEnviar === 0 && conError.length === 0 && inscripciones.length > 0 && (
        <div className="franja enviado" role="status">
          🟢 Todo enviado a la base central{horaUltima ? ` · última vez a las ${horaUltima}` : ''}.
        </div>
      )}
      {!persistente && (
        <div className="franja alerta">
          Recomendación: instalá la app en la pantalla de inicio del celular, así el navegador no borra los datos guardados.
        </div>
      )}
    </>
  );
  const datosAcceso = (
    <p className="saludo">
      {sesion.tarea === 'cargar' ? 'Cargador' : 'Control de presentes'}: <strong>{cargador}</strong><br />
      {varios && <small className="ayuda">Eventos: {eventos.map((e) => e.nombre).join(', ')}<br /></small>}
      <small className="ayuda">Horario: {formatoHorario(sesion.desde, sesion.hasta)}</small>
    </p>
  );

  // Control de presentes (Etapa 4B): la pantalla de la puerta.
  if (sesion.tarea === 'presentes') {
    return (
      <>
        {encabezado}
        {franjaPractica}
        <p className="saludo-puerta">Control de presentes: <strong>{cargador}</strong> · {formatoHorario(sesion.desde, sesion.hasta)}</p>
        {estado === 'antes' ? (
          <main className="contenido">
            <div className="advertencia" role="status">⏰ Tu acceso ya está activado. Vas a poder marcar presentes en este horario: <strong>{formatoHorario(sesion.desde, sesion.hasta)}</strong>.</div>
          </main>
        ) : (
          <>
            {avisoPrimeraVez}
            <Puerta sesion={sesion} evento={evento} enLinea={enLinea}
              soloEnvio={estado === 'vencido' || estado === 'cerrado' ? estado : null}
              alTerminar={async () => { await borrarPuerta(); await terminarAcceso(); setSesion(null); }} />
          </>
        )}
        <main className="contenido pie-acceso"><BotonDejarAcceso sesion={sesion} alDejar={alDejar} /></main>
      </>
    );
  }

  // Antes del horario.
  if (estado === 'antes') {
    return (
      <>
        {encabezado}
        {franjas}
        <main className="contenido">
          {datosAcceso}
          <div className="advertencia" role="status">
            ⏰ Tu acceso ya está activado. Vas a poder cargar inscripciones en este horario: <strong>{formatoHorario(sesion.desde, sesion.hasta)}</strong>.
          </div>
          <BotonDejarAcceso sesion={sesion} alDejar={alDejar} />
        </main>
      </>
    );
  }

  // Modo solo envío: terminó el horario o el organizador cerró el acceso.
  if (estado === 'vencido' || estado === 'cerrado' || (estado === 'inscripciones_cerradas' && pantalla !== 'formulario')) {
    const todoEnviado = sinEnviar === 0 && conError.length === 0;
    return (
      <>
        {encabezado}
        {franjas}
        {pantalla === 'resumen' ? (
          <Resumen cargador={cargador} resumenes={resumen} eventos={eventos} alVolver={volver} />
        ) : (
          <main className="contenido">
            {datosAcceso}
            <div className="aviso-fin" role="status">
              {estado === 'cerrado' ? '🔒 El organizador cerró tu acceso.' : estado === 'inscripciones_cerradas' ? '🔒 El organizador cerró las inscripciones del evento.' : '⏱️ Terminó tu horario.'} Ya no se pueden cargar inscripciones.
              {estado === 'inscripciones_cerradas' && <small className="nota-reabrir">Si el organizador las vuelve a abrir dentro de tu horario, esta pantalla vuelve sola a «+ Nueva inscripción».</small>}
            </div>
            {!todoEnviado ? (
              <>
                <p>Quedan <strong>{sinEnviar + conError.length}</strong> inscripciones guardadas en este celular. Conectate a internet para enviarlas: no cierres ni borres la app.</p>
                <button className="boton principal grande" onClick={enviarAhora} disabled={enviando || !enLinea}>
                  {enviando ? 'Enviando…' : enLinea ? 'Enviar ahora' : 'Sin internet: conectate para enviar'}
                </button>
              </>
            ) : (
              <p>🟢 Todo lo que cargaste ya llegó a la base central. ¡Gracias por colaborar!</p>
            )}
            <button className="tarjeta ancho" onClick={() => setPantalla('resumen')}>
              <span className="numero">💵</span>
              <span>Resumen para rendir</span>
            </button>
            {todoEnviado && (
              <button className="boton secundario" onClick={async () => { await terminarAcceso(); setSesion(null); setPantalla('inicio'); }}>
                Terminar y activar otro QR
              </button>
            )}
          </main>
        )}
      </>
    );
  }

  return (
    <>
      {encabezado}
      {franjas}

      {pantalla === 'inicio' && (
        <main className="contenido">
          {avisoPrimeraVez}
          {aviso && <div className="exito" role="status">{aviso}</div>}
          {datosAcceso}
          <button className="boton principal grande" onClick={() => { setAviso(''); setPantalla(varios ? 'elegir' : 'formulario'); }}>
            + Nueva inscripción
          </button>
          <div className="tarjetas">
            <button className="tarjeta" onClick={() => setPantalla('lista')}>
              <span className="numero">{inscripciones.length}</span>
              <span>Inscripciones en este dispositivo</span>
            </button>
            <button className="tarjeta" onClick={() => setPantalla('resumen')}>
              <span className="numero">💵</span>
              <span>Resumen para rendir</span>
            </button>
          </div>
          <Ayuda tema="cargador" />
          <BotonDejarAcceso sesion={sesion} sinEnviar={inscripciones.filter((i) => ['pendiente', 'enviando', 'error'].includes(i.estado)).length} alDejar={alDejar} />
        </main>
      )}

      {pantalla === 'elegir' && (
        <ElegirEvento eventos={eventos} disponible={(id) => eventoDisponible(sesion, id)}
          alElegir={(id) => { setEventoElegido(id); setPantalla('formulario'); }} alVolver={volver} />
      )}

      {pantalla === 'formulario' && eventoFormulario && (
        <Formulario
          key={eventoFormulario.id}
          evento={eventoFormulario}
          cargador={cargador}
          sesionId={sesion.sesionId}
          presenciales={varios ? (sesion.eventosEstado && sesion.eventosEstado[eventoFormulario.id] ? sesion.eventosEstado[eventoFormulario.id].presenciales : null) : sesion.presenciales}
          alCancelar={volver}
          alGuardar={(texto) => {
            setAviso(texto);
            volver();
            enviarAhora();
          }}
        />
      )}

      {pantalla === 'lista' && <Lista eventos={eventos} inscripciones={inscripciones} alVolver={volver} />}

      {pantalla === 'resumen' && <Resumen cargador={cargador} resumenes={resumen} eventos={eventos} alVolver={volver} />}
    </>
  );
}
