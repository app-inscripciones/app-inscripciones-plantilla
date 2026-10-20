import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Marca from './Marca.jsx';
import { rpc, pedirCodigo, verificarCodigo, haySesion, salir, correoValido, MENSAJES_PANEL, NOMBRES_ROLES, mensajeError } from '../datos/panel.js';
import { AccesosQR } from './Organizar.jsx';
import { Resumen, ListaInscripciones, SelectorEvento } from './ControlEvento.jsx';
import { Rendiciones, AccionesInscripcion } from './Gestion.jsx';
import { descargarExcel } from '../datos/excel.js';
import { formatoFechaHora, formatoDia, nombreNormal } from '../logica/fechas.js';
import { Institucion } from './Configuracion.jsx';
import { useInstitucion } from '../datos/institucion.js';
import PrimerosPasos, { usePrimerosPasos } from './PrimerosPasos.jsx';
import Ayuda from './Ayuda.jsx';
import EstadoSistema, { useEstadoSistema, CartelEstado } from './EstadoSistema.jsx';
import { usePractica, ProveedorPractica } from './AvisoPractica.jsx';
import { GuiaPractica } from './GuiaPractica.jsx';
import { definicionPractica } from '../logica/practica.js';
import { diaLocal } from '../logica/fechas.js';

const Eventos = lazy(() => import('./Asistente.jsx'));

// Panel de administración (Etapa 4): ingreso, control del evento, inscripciones, rendiciones, QR, personas y Excel.

function Ingreso({ alEntrar }) {
  const [correo, setCorreo] = useState(() => {
    try { return localStorage.getItem('panel-correo') || ''; } catch { return ''; }
  });
  const [paso, setPaso] = useState('correo'); // 'correo' | 'codigo'
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const enviar = async () => {
    setOcupado(true); setError('');
    const r = await pedirCodigo(correo);
    setOcupado(false);
    if (!r.ok) { setError(mensajeError(r)); return; }
    try { localStorage.setItem('panel-correo', correo.trim().toLowerCase()); } catch { /* nada */ }
    setPaso('codigo');
  };
  const entrar = async () => {
    setOcupado(true); setError('');
    const r = await verificarCodigo(correo, codigo);
    setOcupado(false);
    if (!r.ok) { setError(mensajeError(r)); return; }
    alEntrar();
  };

  return (
    <main className="contenido angosto">
      <h1>Ingresar al panel</h1>
      {paso === 'correo' ? (
        <>
          <p className="ayuda">Escribí tu correo. Te mandamos un <strong>código de 6 números</strong> para entrar. No hace falta contraseña.</p>
          <label className="campo">
            <span className="etiqueta">Tu correo</span>
            <input id="correo-panel" type="email" inputMode="email" autoComplete="email" value={correo}
              onChange={(e) => { setCorreo(e.target.value); setError(''); }} placeholder="nombre@gmail.com" />
          </label>
          {error && <div className="error-grande" role="alert">{error}</div>}
          <button className="boton principal grande" disabled={!correoValido(correo) || ocupado} onClick={enviar}>
            {ocupado ? 'Enviando…' : 'Enviarme el código'}
          </button>
        </>
      ) : (
        <>
          <p>Te mandamos un código a <strong>{correo.trim().toLowerCase()}</strong>. Si no aparece, mirá en «Spam» o «Promociones».</p>
          <label className="campo">
            <span className="etiqueta">Código</span>
            <input id="codigo-panel" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={codigo}
              onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '')); setError(''); }} placeholder="123456" />
          </label>
          {error && <div className="error-grande" role="alert">{error}</div>}
          <button className="boton principal grande" disabled={codigo.length < 6 || ocupado} onClick={entrar}>
            {ocupado ? 'Verificando…' : 'Entrar'}
          </button>
          <button className="enlace" onClick={() => { setPaso('correo'); setCodigo(''); setError(''); }}>Usar otro correo o pedir otro código</button>
          <p className="ayuda"><a href="#ayuda">🛟 ¿No llega el código? Mirá «¿Qué hago si…?»</a></p>
        </>
      )}
    </main>
  );
}

const ROLES_ORDEN = ['responsable', 'organizador', 'tesorero', 'consulta'];
const AYUDA_ROLES = {
  responsable: 'Da de alta a las personas y les asigna roles. Ve todo.',
  organizador: 'Crea eventos y los QR, corrige y anula inscripciones.',
  tesorero: 'Registra las rendiciones de efectivo y ve el dinero.',
  consulta: 'Solo mira el panel y descarga el Excel.',
};

function Personas({ yo, alCambiarmeRoles, alVolver }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await rpc('panel_usuarios');
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    setLista(r.usuarios);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setOcupado(true); setError('');
    const r = await rpc('panel_guardar_usuario', { p_email: form.email, p_nombre: form.nombre, p_roles: form.roles, p_activo: form.activo });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    const fuiYo = form.email === yo.email;
    setForm(null);
    cargar();
    // Si me cambié mis propios roles, las pestañas se actualizan solas (sin recargar la página).
    if (fuiYo && alCambiarmeRoles) alCambiarmeRoles();
  };

  if (form) {
    const alternar = (rol) => setForm({ ...form, roles: form.roles.includes(rol) ? form.roles.filter((x) => x !== rol) : [...form.roles, rol] });
    return (
      <section className="panel-form">
        <h2>{form.nuevo ? 'Nueva persona' : `Modificar a ${form.nombre}`}</h2>
        <label className="campo">
          <span className="etiqueta">Nombre y apellido</span>
          <input id="nombre-usuario" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <label className="campo">
          <span className="etiqueta">Correo (con el que va a ingresar)</span>
          <input id="correo-usuario" type="email" value={form.email} disabled={!form.nuevo} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <fieldset className="campo">
          <legend className="etiqueta">Roles (puede tener varios)</legend>
          <div className="lista-roles">
            {ROLES_ORDEN.map((rol) => (
              <label key={rol} className={`rol-opcion ${form.roles.includes(rol) ? 'elegida' : ''}`}>
                <input type="checkbox" checked={form.roles.includes(rol)} onChange={() => alternar(rol)} />
                <span><strong>{NOMBRES_ROLES[rol]}</strong><small>{AYUDA_ROLES[rol]}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        {!form.nuevo && (
          <label className="rol-opcion">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            <span><strong>Puede ingresar</strong><small>Si lo destildás, la persona ya no puede entrar al panel (no se borra nada).</small></span>
          </label>
        )}
        {error && <div className="error-grande" role="alert">{error}</div>}
        <div className="botones-barra">
          <button className="boton secundario" onClick={() => { setForm(null); setError(''); }}>Cancelar</button>
          <button className="boton principal" disabled={ocupado || form.roles.length === 0 || form.nombre.trim().length < 2 || !correoValido(form.email)} onClick={guardar}>
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Personas y roles</h2>
      <p className="ayuda">Quienes administran el sistema. Cada persona entra con su correo y un código.</p>
      <button className="boton principal" style={{ maxWidth: 320 }} onClick={() => setForm({ nuevo: true, email: '', nombre: '', roles: [], activo: true })}>
        + Agregar persona
      </button>
      {alVolver && lista && lista.length > 0 && (
        <button className="boton secundario" style={{ maxWidth: 320, marginLeft: 8 }} onClick={alVolver}>Volver a Primeros pasos →</button>
      )}
      {error && <div className="error-grande" role="alert">{error}</div>}
      {!lista ? <p>Cargando…</p> : (
        <table className="tabla tabla-panel">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Roles</th><th /></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                <td>{u.nombre}{u.email === yo.email ? ' (vos)' : ''}</td>
                <td>{u.email}</td>
                <td>{u.activo ? u.roles.map((r) => NOMBRES_ROLES[r]).join(', ') : 'Sin acceso'}</td>
                <td><button className="boton-chico" onClick={() => setForm({ nuevo: false, email: u.email, nombre: u.nombre, roles: u.roles, activo: u.activo })}>Modificar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BotonExcel({ evento }) {
  const [estado, setEstado] = useState('');
  const bajar = async () => {
    setEstado('armando');
    const ex = await rpc('panel_exportar', { p_evento: evento.id });
    if (!ex || !ex.ok) { setEstado('error'); return; }
    try { await descargarExcel(evento, ex); setEstado(''); } catch { setEstado('error'); }
  };
  return (
    <span className="boton-excel">
      <button className="boton principal" onClick={bajar} disabled={estado === 'armando'}>{estado === 'armando' ? 'Armando…' : '⤓ Descargar Excel'}</button>
      {estado === 'error' && <span className="error">No se pudo armar el Excel. Probá de nuevo.</span>}
    </span>
  );
}

// D46: cerrar o volver a abrir las inscripciones de un evento (Organizador), en cualquier momento.
function CierreInscripciones({ evento, puede, alCambiar }) {
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cerradas = !!evento.inscripcionesCerradasEn;
  const ejecutar = async () => {
    setOcupado(true); setError('');
    const r = await rpc('panel_cerrar_inscripciones', { p_evento: evento.id, p_cerrar: !cerradas, p_motivo: motivo });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    setConfirmar(false); setMotivo('');
    alCambiar();
  };
  return (
    <div className={`cierre-inscripciones ${cerradas ? 'cerradas' : ''}`}>
      {cerradas ? (
        <span>🔒 <strong>Inscripciones cerradas</strong> desde el {formatoFechaHora(evento.inscripcionesCerradasEn)}{evento.inscripcionesCerradasPor ? ` (${evento.inscripcionesCerradasPor})` : ''}. La puerta sigue funcionando.</span>
      ) : <span>🟢 Inscripciones abiertas.</span>}
      {puede && !confirmar && (
        <button className="boton-chico" onClick={() => setConfirmar(true)}>{cerradas ? 'Volver a abrir las inscripciones' : 'Cerrar las inscripciones'}</button>
      )}
      {puede && confirmar && (
        <div className="panel-form confirmar-cierre">
          <p>
            {cerradas
              ? 'Se van a poder crear QR de cargador otra vez, y los cargadores con su QR en horario pueden volver a inscribir.'
              : 'Los cargadores ya no van a poder inscribir: sus celulares pasan a «solo envío» y no se pueden crear QR de cargador. Lo que ya cargaron y todavía no enviaron se recibe igual. La puerta (control de presentes) sigue funcionando. Se puede volver a abrir cuando quieras.'}
          </p>
          <label className="campo"><span className="etiqueta">Motivo (opcional)</span>
            <input id="motivo-cierre" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={cerradas ? 'Ej.: se liberaron lugares' : 'Ej.: cupo completo'} />
          </label>
          {error && <div className="error-grande">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => setConfirmar(false)} disabled={ocupado}>Cancelar</button>
            <button id="confirmar-cierre" className="boton principal" onClick={ejecutar} disabled={ocupado}>{cerradas ? 'Sí, volver a abrir' : 'Sí, cerrar las inscripciones'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const cantidad = (n, uno, varios) => `${n} ${Number(n) === 1 ? uno : varios}`;

// D65 · Borrar un evento sin datos o archivarlo (con datos). Nada con datos se borra desde la app.
function BorrarArchivar({ evento, alCambiar, alBorrado }) {
  const [info, setInfo] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    const r = await rpc('panel_estado_borrado', { p_evento: evento.id });
    if (r && r.ok) setInfo(r);
  }, [evento.id]);
  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  if (evento.practica) return null;
  if (evento.archivadoEn) return null; // el cartel de «archivado» tiene su propio botón
  const sinDatos = info && info.inscripciones === 0 && info.presentes === 0 && info.rendiciones === 0;
  const pend = info ? info.pendiente : null;
  const hayPendiente = pend && (pend.efectivo > 0 || pend.tickets > 0);
  const pideNombre = info && (sinDatos || !info.terminado);
  const nombreOk = !pideNombre || nombreNormal(nombre) === nombreNormal(evento.nombre);

  const ejecutar = async () => {
    setOcupado(true); setError('');
    const r = sinDatos
      ? await rpc('panel_borrar_evento', { p_evento: evento.id, p_confirmacion: nombre })
      : await rpc('panel_archivar_evento', { p_evento: evento.id, p_archivar: true, p_confirmacion: nombre });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); cargar(); return; }
    setAbierto(false); setNombre('');
    if (sinDatos) alBorrado(); else alCambiar();
  };

  if (!abierto) {
    return (
      <div className="borrar-archivar">
        <button id="borrar-archivar" className="boton-chico" onClick={() => setAbierto(true)}>Borrar o archivar este evento…</button>
      </div>
    );
  }
  return (
    <div className="borrar-archivar panel-form">
      {!info ? <p>Revisando el evento…</p> : sinDatos ? (
        <>
          <h3>🗑️ Borrar este evento</h3>
          <p>Este evento <strong>no tiene inscripciones, presentes ni rendiciones</strong>, así que se puede borrar. También se borran sus QR: los celulares que los tengan activados dejan de funcionar para este evento. <strong>No se puede deshacer.</strong></p>
        </>
      ) : (
        <>
          <h3>📦 Archivar este evento</h3>
          <p>Tiene {[cantidad(info.inscripciones, 'inscripción', 'inscripciones'), info.presentes && cantidad(info.presentes, 'presente', 'presentes'), info.rendiciones && cantidad(info.rendiciones, 'rendición', 'rendiciones')].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' y $1')}, así que <strong>no se puede borrar</strong>. Se puede <strong>archivar</strong>: deja de aparecer en el panel y en los QR, pero <strong>no se borra nada</strong>. Se cierran las inscripciones y todos sus QR. Se puede volver a mostrar cuando quieras (tildando «Ver archivados»).</p>
          {hayPendiente && (
            <div className="error-grande" role="alert">
              No se puede archivar todavía: falta rendir {pend.efectivo > 0 ? `$ ${pend.efectivo.toLocaleString('es-AR')} en efectivo` : ''}{pend.efectivo > 0 && pend.tickets > 0 ? ' y ' : ''}{pend.tickets > 0 ? `${pend.tickets} ticket${pend.tickets === 1 ? '' : 's'} de la terminal` : ''}. El Tesorero lo registra en «Rendiciones».
            </div>
          )}
          {!hayPendiente && !info.terminado && (
            <div className="advertencia" role="alert">⚠️ <strong>Este evento todavía no terminó.</strong> Si lo archivás, los cargadores y la puerta dejan de poder usarlo. ¿Seguro que es lo que querés?</div>
          )}
        </>
      )}
      {info && !(hayPendiente && !sinDatos) && (
        <>
          {pideNombre && (
            <label className="campo"><span className="etiqueta">Para confirmar, escribí el nombre del evento: «{evento.nombre}»</span>
              <input id="confirmar-nombre-evento" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
            </label>
          )}
          {error && <div className="error-grande">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => { setAbierto(false); setNombre(''); setError(''); }} disabled={ocupado}>Cancelar</button>
            <button id="confirmar-borrar-archivar" className="boton principal peligro-fondo" onClick={ejecutar} disabled={ocupado || !nombreOk}>
              {ocupado ? 'Un momento…' : sinDatos ? 'Sí, borrar el evento' : 'Sí, archivar el evento'}
            </button>
          </div>
        </>
      )}
      {info && hayPendiente && !sinDatos && (
        <div className="botones-barra"><button className="boton secundario" onClick={() => setAbierto(false)}>Cerrar</button></div>
      )}
    </div>
  );
}

function CartelArchivado({ evento, puede, alCambiar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const mostrar = async () => {
    setOcupado(true); setError('');
    const r = await rpc('panel_archivar_evento', { p_evento: evento.id, p_archivar: false });
    setOcupado(false);
    if (!r || !r.ok) setError(mensajeError(r)); else alCambiar();
  };
  return (
    <div className="aviso-archivado" role="note">
      📦 <strong>Evento archivado</strong> el {formatoFechaHora(evento.archivadoEn)}{evento.archivadoPor ? ` (${evento.archivadoPor})` : ''}. No se borró nada: se puede consultar y bajar el Excel. No aparece en los QR.
      {puede && <> <button id="desarchivar" className="boton-chico" onClick={mostrar} disabled={ocupado}>Volver a mostrar</button></>}
      {error && <div className="error-grande">{error}</div>}
    </div>
  );
}

export default function Panel() {
  const inst = useInstitucion();
  const [estado, setEstado] = useState('cargando'); // cargando | ingreso | listo | no_habilitado | error
  const [yo, setYo] = useState(null);
  const [seccion, setSeccion] = useState('');
  const [qrPedido, setQrPedido] = useState({ n: 0, tarea: '' });
  const [eventos, setEventos] = useState([]);
  const [eventoId, setEventoId] = useState('');
  const [filtroLista, setFiltroLista] = useState('todas');
  const [verArchivados, setVerArchivados] = useState(false);

  const cargarPerfil = useCallback(async () => {
    if (!(await haySesion())) { setEstado('ingreso'); return; }
    const r = await rpc('mi_perfil');
    if (r && r.ok) {
      const ev = await rpc('panel_eventos');
      const lista = ev && ev.ok ? ev.eventos : [];
      setEventos(lista);
      const hoy = new Date().toISOString().slice(0, 10);
      const abiertos = lista.filter((e) => e.estado === 'abierto' && !e.practica && !e.archivadoEn);
      const proximo = abiertos.filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const visibles = lista.filter((e) => !e.archivadoEn);
      setEventoId((id) => (id && lista.some((e) => e.id === id) ? id : '') || (proximo || abiertos[0] || visibles.find((e) => !e.practica) || visibles[0] || {}).id || '');
      setYo(r);
      setSeccion((s) => s || 'resumen');
      setEstado('listo');
    } else if (r && r.error === 'no_habilitado') {
      setYo(r); setEstado('no_habilitado');
    } else if (r && r.error === 'sesion_vencida') {
      await salir(); setEstado('ingreso');
    } else setEstado('error');
  }, []);
  useEffect(() => { cargarPerfil(); }, [cargarPerfil]);
  // Al crear un QR, la guía de práctica pasa sola al paso siguiente (sin cambiar de pestaña ni recargar).
  const recargarPracticaRef = useRef(null);
  const apiQR = useMemo(() => ({
    datos: () => rpc('panel_datos_accesos'),
    crear: async (p) => {
      const r = await rpc('panel_crear_acceso', p);
      if (r && r.ok && recargarPracticaRef.current) recargarPracticaRef.current();
      return r;
    },
    // D77: un QR de cargador con varios eventos.
    crearVarios: async (p) => {
      const r = await rpc('panel_crear_acceso_varios', p);
      if (r && r.ok && recargarPracticaRef.current) recargarPracticaRef.current();
      return r;
    },
    cerrar: (id) => rpc('panel_cerrar_acceso', { p_acceso: id }),
    autopresentes: (ev) => rpc('panel_autopresentes', { p_evento: ev }),
    crearAutopresente: (p) => rpc('panel_crear_autopresente', p),
    cerrarAutopresente: (id) => rpc('panel_cerrar_autopresente', { p_id: id }),
  }), []);

  const esResponsable = estado === 'listo' && !!yo && (yo.roles || []).includes('responsable');
  const est = useEstadoSistema(esResponsable);
  const practica = usePractica(estado === 'listo');
  recargarPracticaRef.current = practica.recargar;
  const pp = usePrimerosPasos({ activo: esResponsable, institucionConfigurada: inst.configurada, eventos, respaldoOk: est.respaldoOk,
    practicaHecha: !!(practica.datos && practica.datos.alguienPracticoOrganizador) });
  const recargarPasos = pp.recargar;
  useEffect(() => { if (esResponsable) recargarPasos(); }, [seccion, esResponsable, recargarPasos]);
  const recargarPractica = practica.recargar;
  useEffect(() => { recargarPractica(); }, [seccion, recargarPractica]);

  const salirDelPanel = async () => { await salir(); setYo(null); setSeccion(''); setEstado('ingreso'); };

  const encabezado = (
    <header className="encabezado">
      <Marca titulo="Panel" />
      {yo && estado === 'listo' && (
        <div className="usuario-panel">
          <span>{yo.nombre}</span>
          <button className="boton-chico claro" onClick={salirDelPanel}>Salir</button>
        </div>
      )}
    </header>
  );

  if (estado === 'cargando') return <>{encabezado}<main className="contenido">Cargando…</main></>;
  if (estado === 'ingreso') return <>{encabezado}<Ingreso alEntrar={cargarPerfil} /></>;
  if (estado === 'no_habilitado' || estado === 'error') {
    return (
      <>
        {encabezado}
        <main className="contenido angosto">
          <div className="error-grande">{estado === 'error' ? MENSAJES_PANEL.sin_conexion : MENSAJES_PANEL.no_habilitado}</div>
          <button className="boton secundario" onClick={estado === 'error' ? cargarPerfil : salirDelPanel}>{estado === 'error' ? 'Reintentar' : 'Salir'}</button>
        </main>
      </>
    );
  }

  const tiene = (rol) => yo.roles.includes(rol);
  // D66: «Practicar ahora» lleva a la práctica abierta (o la crea) y muestra dónde seguir.
  const practicaAbierta = eventos.find((e) => e.practica && !e.archivadoEn);
  const practicar = async (rol, tareaQR = '') => {
    let id = practicaAbierta && practicaAbierta.id;
    if (!id && tiene('organizador')) {
      const r = await rpc('panel_crear_practica', { p_definicion: definicionPractica(diaLocal()) });
      if (r && r.ok) id = r.id;
    }
    if (!id) return;
    setEventoId(id);
    await cargarPerfil();
    if (tareaQR) setQrPedido((q) => ({ n: q.n + 1, tarea: tareaQR }));
    setSeccion(rol === 'tesorero' ? 'rendiciones' : 'qr');
  };
  // D69: lo que hace el botón del asistente de práctica en cada paso.
  const accionGuia = async (accion, qr) => {
    if (accion === 'rendiciones') return practicar('tesorero');
    if (accion === 'otroQR') { for (const id of qr.sinActivar) await apiQR.cerrar(id); }
    return practicar('organizador', accion === 'qrPresentes' ? 'presentes' : 'cargar');
  };
  const valorPractica = { datos: practica.datos, recargar: practica.recargar, practicar, hayPractica: !!practicaAbierta, puedeOrganizar: tiene('organizador') };
  const evento = eventos.find((e) => e.id === eventoId);
  const archivados = eventos.filter((e) => e.archivadoEn).length;
  const eventosVisibles = eventos.filter((e) => !e.archivadoEn || verArchivados || e.id === eventoId);
  const secciones = [
    ['resumen', 'Resumen'],
    ['inscripciones', 'Inscripciones'],
    ['rendiciones', 'Rendiciones'],
    tiene('organizador') && ['eventos', 'Crear eventos'],
    tiene('organizador') && ['qr', 'QR de colaboradores'],
    tiene('responsable') && ['personas', 'Personas y roles'],
    tiene('responsable') && ['institucion', 'Institución'],
    tiene('responsable') && ['estado', `Estado del sistema${est.problemas ? ' 🔴' : ''}`],
  ].filter(Boolean);
  const delEvento = ['resumen', 'inscripciones', 'rendiciones'].includes(seccion);

  return (
    <>
      {encabezado}
      <nav className="pestanas" aria-label="Secciones del panel">
        {secciones.map(([id, nombre]) => (
          <button key={id} className={seccion === id ? 'activa' : ''} aria-current={seccion === id ? 'page' : undefined} onClick={() => { setSeccion(id); setQrPedido((q) => ({ ...q, tarea: '' })); if (id !== 'inscripciones') setFiltroLista('todas'); }}>{nombre}</button>
        ))}
      </nav>
      <ProveedorPractica valor={valorPractica}>
      <main className="contenido ancho">
        <p className="ayuda">Hola, <strong>{yo.nombre}</strong> · {yo.roles.map((r) => NOMBRES_ROLES[r]).join(', ')}
          {tiene('responsable') && pp.oculta && !pp.completo && <> · <button className="enlace" onClick={pp.mostrar}>Ver primeros pasos ({pp.hechos} de {pp.total})</button></>}
        </p>
        <GuiaPractica yo={yo} tiene={tiene} practica={practica} hayPractica={!!practicaAbierta} alAccion={accionGuia}
          datosQR={tiene('organizador') ? apiQR.datos : null} />
        {tiene('responsable') && seccion === 'resumen' && <CartelEstado estado={est} alVer={() => setSeccion('estado')} />}
        {tiene('responsable') && seccion === 'resumen' && <PrimerosPasos pp={pp} tieneRol={tiene} irA={(s) => setSeccion(s)} />}
        {tiene('responsable') && pp.oculta && !inst.configurada && seccion !== 'institucion' && (
          <div className="advertencia">
            Todavía no cargaste los datos de la institución (nombre, colores y logo).{' '}
            <button className="boton-chico" onClick={() => setSeccion('institucion')}>Cargar ahora</button>
          </div>
        )}
        <Ayuda key={seccion} tema={seccion === 'abierto' ? 'qr' : seccion} />
        {delEvento && (
          !evento ? <p className="advertencia">Todavía no hay eventos abiertos. {tiene('organizador') ? <>Creá uno en <button className="boton-chico" onClick={() => setSeccion('eventos')}>Crear eventos</button></> : 'Los crea una persona con el rol Organizador, en «Crear eventos».'}</p> : (
            <div className="cabecera-evento">
              <div>
                <SelectorEvento eventos={eventosVisibles} eventoId={eventoId} alElegir={setEventoId}
                  archivados={archivados} verArchivados={verArchivados} alVerArchivados={setVerArchivados} />
                <h2>{evento.practica ? '🧪 ' : ''}{evento.nombre} <small className="fecha-evento">{formatoDia(evento.fecha)}</small></h2>
              </div>
              <BotonExcel evento={evento} />
            </div>
          )
        )}
        {delEvento && evento && evento.practica && (
          <div className="aviso-practica" role="note">
            🧪 Evento de práctica: sirve para capacitar a los voluntarios. No es real, no se mezcla con los demás eventos y se borra solo, con todo lo cargado, al terminar la semana.
          </div>
        )}
        {delEvento && evento && evento.archivadoEn && (
          <CartelArchivado evento={evento} puede={tiene('organizador')} alCambiar={cargarPerfil} />
        )}
        {evento && seccion === 'resumen' && (
          <CierreInscripciones evento={evento} puede={tiene('organizador') && !evento.archivadoEn} alCambiar={cargarPerfil} />
        )}
        {evento && seccion === 'resumen' && (
          <Resumen key={evento.id} evento={evento} puedeEditarMomentos={tiene('organizador')} alVerRevisar={() => { setFiltroLista('revisar'); setSeccion('inscripciones'); }} />
        )}
        {evento && seccion === 'resumen' && tiene('organizador') && (
          <BorrarArchivar key={'ba-' + evento.id} evento={evento} alCambiar={cargarPerfil}
            alBorrado={async () => { setEventoId(''); await cargarPerfil(); }} />
        )}
        {evento && seccion === 'inscripciones' && (
          <ListaInscripciones key={evento.id} evento={evento} filtroInicial={filtroLista}
            renderAcciones={(i, terminar) => <AccionesInscripcion evento={evento} i={i} puedeCorregir={tiene('organizador')} alTerminar={terminar} />} />
        )}
        {evento && seccion === 'rendiciones' && <Rendiciones key={evento.id} evento={evento} puedeRegistrar={tiene('tesorero')} />}
        {seccion === 'eventos' && tiene('organizador') && (
          <Suspense fallback={<p>Cargando…</p>}>
            <Eventos alAbierto={async (id) => { await cargarPerfil(); setEventoId(id); setSeccion('abierto'); }} />
          </Suspense>
        )}
        {seccion === 'abierto' && evento && (
          <section className="angosto-form">
            <div className="exito">✅ «{evento.nombre}» está abierto.</div>
            <p>Ahora podés generar los QR para los cargadores y para la puerta.</p>
            <div className="botones-fila">
              <button className="boton principal" onClick={() => setSeccion('qr')}>Generar QR de colaboradores</button>
              <button className="boton secundario" onClick={() => setSeccion('resumen')}>Ver el resumen del evento</button>
            </div>
          </section>
        )}
        {seccion === 'qr' && tiene('organizador') && <AccesosQR key={`qr-${eventoId}-${qrPedido.n}`} api={apiQR} mostrarVolver={false} eventoInicial={eventoId} formInicial={qrPedido.tarea} nombreInicial={qrPedido.tarea ? yo.nombre : ''} />}
        {seccion === 'personas' && tiene('responsable') && <Personas yo={yo} alCambiarmeRoles={cargarPerfil} alVolver={() => setSeccion('resumen')} />}
        {seccion === 'estado' && tiene('responsable') && <EstadoSistema estado={est} />}
        {seccion === 'institucion' && tiene('responsable') && <Institucion alVolver={() => setSeccion('resumen')} />}
      </main>
      </ProveedorPractica>
    </>
  );
}
