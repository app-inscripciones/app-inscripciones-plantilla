import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { llamarFuncion } from '../datos/sincronizacion.js';
import { diaLocal, formatoHorario, formatoDia } from '../logica/fechas.js';
import { mensajeError } from '../datos/mensajes.js';
import { AvisoPractica } from './AvisoPractica.jsx';

// ---------------- Autopresente con QR (R20, D62) ----------------
const enlaceAuto = (codigo) => `${window.location.origin}/#autopresente/${codigo}`;
const enlacePantalla = (pantalla) => `${window.location.origin}/#pantalla-autopresente/${pantalla}`;

function imprimirCartel({ imagen, evento, momento, horario: h }) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel · Marcá tu presente</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;margin:24px}h1{font-size:44px;margin:8px 0}p{font-size:22px;margin:8px 0}img{width:420px;max-width:90%}.chico{font-size:16px;color:#555}</style>
</head><body><h1>📱 Marcá tu presente</h1><p>Escaneá este código con la cámara de tu celular</p><img src="${imagen}" alt="QR">
<p><strong>${esc(evento)}</strong> · ${esc(momento)}</p><p class="chico">Válido ${esc(h)}. Escribí tu DNI o tu teléfono y confirmá tu nombre. Si no tenés internet o no aparecés, acercate a la puerta.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return true;
}

function CartelQR({ qr, evento, momento }) {
  const [imagen, setImagen] = useState('');
  const [imagenPantalla, setImagenPantalla] = useState('');
  useEffect(() => {
    if (qr.modo === 'impreso') QRCode.toDataURL(enlaceAuto(qr.codigo), { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then(setImagen);
    else QRCode.toDataURL(enlacePantalla(qr.pantalla), { width: 360, margin: 1, errorCorrectionLevel: 'M' }).then(setImagenPantalla);
  }, [qr]);
  const h = formatoHorario(qr.desde, qr.hasta);
  if (qr.modo === 'impreso') {
    return (
      <div className="cartel-autopresente">
        <h3>📱 Marcá tu presente</h3>
        {imagen && <img src={imagen} alt="QR de autopresente" />}
        <p><strong>{evento.nombre}</strong> · {momento}</p>
        <p className="ayuda">Válido {h}. Imprimilo y pegalo en la entrada.</p>
        <button className="boton principal" id="imprimir-cartel" disabled={!imagen} onClick={() => imprimirCartel({ imagen, evento: evento.nombre, momento, horario: h })}>🖨️ Imprimir cartel</button>
      </div>
    );
  }
  return (
    <div className="cartel-autopresente">
      <h3>🖥️ QR en una pantalla</h3>
      <p>Abrí esta pantalla en un celular, tablet o computadora con internet, en la entrada. Muestra un QR que cambia cada 30 segundos.</p>
      <a className="boton principal" id="abrir-pantalla" href={enlacePantalla(qr.pantalla)} target="_blank" rel="noreferrer">Abrir la pantalla en este aparato</a>
      <p className="ayuda">O escaneá este código con el aparato que vas a dejar en la entrada:</p>
      {imagenPantalla && <img src={imagenPantalla} alt="QR para abrir la pantalla" style={{ width: 200 }} />}
      <div className="advertencia">⚠️ Este código de arriba es solo para abrir la pantalla: no lo muestres al público ni lo imprimas.</div>
      <p className="ayuda">Válido {h}.</p>
    </div>
  );
}

export function AutopresentesQR({ api, evento }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aCerrar, setACerrar] = useState(null);
  const cargar = useCallback(async () => {
    const r = await api.autopresentes(evento.id);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    setError(''); setD(r);
  }, [api, evento.id]);
  useEffect(() => { setD(null); setForm(null); setNuevo(null); cargar(); }, [cargar]);
  if (!d || !d.habilitado) return null;
  const momento = (id) => (d.instancias.find((i) => i.id === id) || {}).nombre || id;

  const abrir = () => {
    const ahora = new Date();
    const hoy = diaLocal(ahora);
    const inst = d.instancias.find((i) => i.fecha === hoy) || d.instancias[0];
    setForm({ instancia: inst.id, modo: 'impreso', dia: inst.fecha >= hoy ? inst.fecha : hoy, desde: horaRedonda(ahora), hasta: horaRedonda(new Date(ahora.getTime() + 4 * 3600 * 1000)) });
    setNuevo(null); setError('');
  };
  const crear = async () => {
    const desde = new Date(`${form.dia}T${form.desde}`);
    let hasta = new Date(`${form.dia}T${form.hasta}`);
    if (hasta <= desde) hasta = new Date(hasta.getTime() + 24 * 3600 * 1000);
    setOcupado(true);
    const r = await api.crearAutopresente({ p_evento: evento.id, p_instancia: form.instancia, p_modo: form.modo, p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    setNuevo({ id: r.id, codigo: r.codigo, pantalla: r.pantalla, modo: form.modo, instancia: form.instancia, desde: desde.toISOString(), hasta: hasta.toISOString() });
    setForm(null); cargar();
  };
  const cerrar = async (id) => {
    setOcupado(true);
    const r = await api.cerrarAutopresente(id);
    setOcupado(false); setACerrar(null);
    if (!r || !r.ok) setError(mensajeError(r));
    cargar();
  };
  const estado = (q) => (q.cerradoEn ? 'Cerrado' : new Date(q.hasta) <= new Date() ? 'Vencido' : new Date(q.desde) > new Date() ? 'Todavía no empieza' : 'En horario');

  return (
    <section className="autopresentes">
      <h3>📱 Autopresente con QR</h3>
      <p className="ayuda">Un QR para que cada participante marque su propio presente con su celular (además de la puerta). Las marcas aparecen como «Se anotó solo».</p>
      {!form && !nuevo && <button className="boton principal" id="nuevo-autopresente" onClick={abrir}>+ QR de autopresente</button>}
      {form && (
        <div className="panel-form">
          <h4>Nuevo QR de autopresente</h4>
          {d.instancias.length > 1 && (
            <label className="campo"><span className="etiqueta">¿Para qué momento?</span>
              <select id="momento-autopresente" value={form.instancia} onChange={(e) => setForm({ ...form, instancia: e.target.value })}>
                {d.instancias.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </label>
          )}
          <h4>¿Cómo se va a mostrar?</h4>
          <div className="tarjetas-opcion">
            <button type="button" id="auto-impreso" className={`tarjeta-opcion ${form.modo === 'impreso' ? 'elegida' : ''}`} aria-pressed={form.modo === 'impreso'} onClick={() => setForm({ ...form, modo: 'impreso' })}>
              <span className="icono" aria-hidden="true">🖨️</span><span><strong>Cartel impreso</strong><small>Lo más simple. Vale solo en el horario de abajo. Alguien podría mandarle una foto a otra persona.</small></span>
            </button>
            <button type="button" id="auto-pantalla" className={`tarjeta-opcion ${form.modo === 'pantalla' ? 'elegida' : ''}`} aria-pressed={form.modo === 'pantalla'} onClick={() => setForm({ ...form, modo: 'pantalla' })}>
              <span className="icono" aria-hidden="true">🖥️</span><span><strong>En una pantalla que cambia</strong><small>Más seguro: el QR cambia cada 30 segundos y una foto vieja no sirve. Necesita un celular, tablet o TV con internet en la entrada.</small></span>
            </button>
          </div>
          <label className="campo"><span className="etiqueta">Día</span>
            <input id="dia-autopresente" type="date" value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
          </label>
          <div className="dos-columnas">
            <label className="campo"><span className="etiqueta">Desde</span><input id="desde-autopresente" type="time" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} /></label>
            <label className="campo"><span className="etiqueta">Hasta</span><input id="hasta-autopresente" type="time" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} /></label>
          </div>
          {error && <div className="error-grande" role="alert">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => { setForm(null); setError(''); }}>Cancelar</button>
            <button className="boton principal" id="crear-autopresente" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear QR'}</button>
          </div>
        </div>
      )}
      {nuevo && (
        <>
          <CartelQR qr={nuevo} evento={evento} momento={momento(nuevo.instancia)} />
          <button className="boton secundario" onClick={() => setNuevo(null)}>Listo</button>
        </>
      )}
      {!form && error && <div className="error-grande" role="alert">{error}</div>}
      {d.qrs.length > 0 && !nuevo && (
        <ul className="lista">
          {d.qrs.map((q) => (
            <li key={q.id} className="item">
              <div className="item-titulo">{q.modo === 'impreso' ? '🖨️ Cartel impreso' : '🖥️ Pantalla que cambia'} · {momento(q.instancia)}</div>
              <div className="item-detalle">{formatoHorario(q.desde, q.hasta)} · {estado(q)} · {q.marcas} se anotaron solos</div>
              {!q.cerradoEn && new Date(q.hasta) > new Date() && (
                <div>
                  <button className="boton-chico" style={{ marginLeft: 0 }} onClick={() => setNuevo(q)}>{q.modo === 'impreso' ? 'Ver cartel' : 'Abrir pantalla'}</button>
                  {aCerrar === q.id
                    ? <><button className="boton-chico" onClick={() => setACerrar(null)}>No</button><button className="boton-chico peligro" disabled={ocupado} onClick={() => cerrar(q.id)}>Sí, cerrar</button></>
                    : <button className="boton-chico" onClick={() => setACerrar(q.id)}>Cerrar este QR</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// QR de colaboradores: lo usa la pestaña del panel (Organizador). Sirve para crear los QR de los colaboradores,
// imprimirlos o compartirlos, ver si ya se activaron y cerrarlos. (La pantalla provisoria con clave, D37, se dio de baja en D72.)

const TAREAS = {
  cargar: { nombre: 'Cargar inscripciones', corto: 'Cargador' },
  presentes: { nombre: 'Control de presentes', corto: 'Control de presentes' },
};

const MENSAJES = {
  clave_invalida: 'La clave de organizador no es correcta.',
  evento_cerrado: 'Ese evento no está abierto.',
  inscripciones_cerradas: 'Las inscripciones de este evento están cerradas: no se pueden crear QR de cargador. Sí se pueden crear QR de control de presentes. Para volver a abrirlas: Resumen → «Volver a abrir las inscripciones».',
  nombre_invalido: 'Escribí el nombre y apellido de la persona.',
  horario_invalido: 'Revisá el horario: el final tiene que ser después del comienzo, todavía no tiene que haber pasado y no puede durar más de 7 días.',
  datos_invalidos: 'Faltan datos.',
  sin_conexion: 'No hay internet. Esta pantalla necesita conexión.',
  sin_permiso: 'Tu usuario no tiene permiso para esto (hace falta el rol Organizador).',
};

const horario = (a) => formatoHorario(a.desde, a.hasta);

function estadoDe(a, ahora = new Date()) {
  if (a.cerradoEn) return { texto: 'Cerrado', clase: 'gris' };
  if (new Date(a.hasta) <= ahora) return { texto: 'Vencido', clase: 'gris' };
  if (new Date(a.desde) > ahora) return { texto: a.dispositivos ? 'Activado · todavía no empieza' : 'Sin activar · todavía no empieza', clase: 'amarillo' };
  return { texto: a.dispositivos ? 'Activado · en horario' : 'Sin activar · en horario', clase: a.dispositivos ? 'verde' : 'amarillo' };
}

function horaRedonda(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() < 30 ? 0 : 30, 0, 0);
  return x.toTimeString().slice(0, 5);
}

async function llamar(nombre, cuerpo) {
  try {
    return await llamarFuncion(nombre, cuerpo);
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
}

function TarjetaQR({ acceso, evento, alCerrar }) {
  const [imagen, setImagen] = useState('');
  const enlace = `${window.location.origin}/?a=${acceso.codigo}`;
  useEffect(() => {
    QRCode.toDataURL(enlace, { width: 520, margin: 1, errorCorrectionLevel: 'M' }).then(setImagen);
  }, [enlace]);

  const texto = `${evento.practica ? '🧪 PRÁCTICA (no es real). ' : ''}Hola ${acceso.colaborador}: este es tu acceso para «${TAREAS[acceso.tarea].nombre}» en ${evento.nombre} (${horario(acceso)}).\n` +
    `1) Abrí este enlace e instalá la app: ${enlace}\n2) Abrila desde el ícono y tocá «Activar con QR», o escribí el código ${acceso.codigo}.`;

  const compartir = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Tu acceso', text: texto }); return; } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  return (
    <div className="tarjeta-qr">
      <div className="hoja-qr" id="hoja-qr">
        {evento.practica && <div className="qr-practica">🧪 PRÁCTICA · no es real</div>}
        <div className="qr-tarea">{TAREAS[acceso.tarea].nombre}</div>
        <div className="qr-nombre">{acceso.colaborador}</div>
        <div className="qr-evento">{evento.nombre}</div>
        <div className="qr-horario">{horario(acceso)}</div>
        {imagen && <img src={imagen} alt={`QR de acceso de ${acceso.colaborador}`} className="qr-imagen" />}
        <div className="qr-codigo">{acceso.codigo}</div>
        <ol className="qr-pasos">
          <li>Escaneá el QR con la cámara del celular e <b>instalá la app</b>.</li>
          <li>Abrí la app <b>desde el ícono</b> y tocá <b>Activar con QR</b> (o escribí el código).</li>
          <li>Hace falta internet solo para activar. Este QR sirve para <b>un solo celular</b>.</li>
        </ol>
      </div>
      <div className="no-imprimir botones-fila">
        <button className="boton principal" onClick={() => window.print()}>🖨️ Imprimir</button>
        <button className="boton secundario" onClick={compartir}>📤 Compartir (WhatsApp)</button>
      </div>
      <p className="ayuda no-imprimir">
        Guardá o compartí este QR ahora: por seguridad, el código <b>no se vuelve a mostrar</b>. Si se pierde, creá otro.
      </p>
      <button className="boton secundario no-imprimir" onClick={alCerrar}>Listo</button>
    </div>
  );
}

export function AccesosQR({ api, mostrarVolver = true, eventoInicial = '', formInicial = '', nombreInicial = '' }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [eventoId, setEventoId] = useState('');
  const [form, setForm] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const [aCerrar, setACerrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api.datos();
    if (!r.ok) {
      setError(MENSAJES[r.error] || MENSAJES.datos_invalidos);
      if (api.alFallarClave && r.error === 'clave_invalida') api.alFallarClave();
      return;
    }
    setError('');
    setDatos(r);
    setEventoId((id) => id || ((r.eventos.find((e) => e.id === eventoInicial) || r.eventos.find((e) => !e.practica) || r.eventos[0] || {}).id) || '');
  }, [api]);

  useEffect(() => { cargar(); }, [cargar]);

  // D69: el asistente de práctica abre directamente el formulario del QR (con el nombre de quien practica).
  const [formAbierto, setFormAbierto] = useState(false);
  useEffect(() => {
    if (!datos || formAbierto || !formInicial) return;
    setFormAbierto(true);
    if (!datos.eventos.some((e) => e.id === eventoInicial)) return;
    setEventoId(eventoInicial);
    const ahora = new Date();
    setForm({ tarea: formInicial, nombre: nombreInicial, dia: diaLocal(ahora), desde: horaRedonda(ahora), hasta: horaRedonda(new Date(ahora.getTime() + 4 * 3600 * 1000)) });
  }, [datos, formAbierto, formInicial, eventoInicial, nombreInicial]);

  if (!datos) return <main className="contenido">{error ? <div className="error-grande">{error}</div> : 'Cargando…'}</main>;

  const evento = datos.eventos.find((e) => e.id === eventoId);
  const accesos = datos.accesos.filter((a) => a.eventoId === eventoId);

  if (nuevo && evento) {
    return (
      <main className="contenido">
        <TarjetaQR acceso={nuevo} evento={evento} alCerrar={() => { setNuevo(null); cargar(); }} />
      </main>
    );
  }

  const abrirForm = (tarea) => {
    const ahora = new Date();
    const fin = new Date(ahora.getTime() + 4 * 3600 * 1000);
    setForm({ tarea, nombre: '', dia: diaLocal(ahora), desde: horaRedonda(ahora), hasta: horaRedonda(fin) });
    setError('');
  };

  const crear = async () => {
    const desde = new Date(`${form.dia}T${form.desde}`);
    let hasta = new Date(`${form.dia}T${form.hasta}`);
    if (hasta <= desde) hasta = new Date(hasta.getTime() + 24 * 3600 * 1000); // termina al día siguiente
    setOcupado(true);
    const r = await api.crear({
      p_evento: eventoId, p_nombre: form.nombre, p_tarea: form.tarea,
      p_desde: desde.toISOString(), p_hasta: hasta.toISOString(),
    });
    setOcupado(false);
    if (!r.ok) { setError(MENSAJES[r.error] || MENSAJES.datos_invalidos); return; }
    setNuevo({ codigo: r.codigo, colaborador: form.nombre.trim().replace(/\s+/g, ' '), tarea: form.tarea, desde: desde.toISOString(), hasta: hasta.toISOString() });
    setForm(null);
  };

  const cerrar = async (id) => {
    setOcupado(true);
    const r = await api.cerrar(id);
    setOcupado(false);
    setACerrar(null);
    if (!r.ok) setError(MENSAJES[r.error] || MENSAJES.datos_invalidos);
    cargar();
  };

  return (
    <main className="contenido">
      {mostrarVolver && <h1>Organizar</h1>}
      {datos.eventos.length === 0 && <p>No hay eventos abiertos.</p>}
      {datos.eventos.length > 1 && (
        <div className="opciones" role="radiogroup" aria-label="Evento">
          {datos.eventos.map((e) => (
            <button key={e.id} type="button" className={`opcion ${eventoId === e.id ? 'elegida' : ''}`} aria-pressed={eventoId === e.id} onClick={() => setEventoId(e.id)}>
              {e.practica ? '🧪 ' : ''}{e.nombre}<small>{formatoDia(e.fecha)}{e.inscripcionesCerradas ? ' · Inscripciones cerradas' : ''}</small>
            </button>
          ))}
        </div>
      )}
      {evento && !form && (
        <>
          <h2>{evento.practica ? '🧪 ' : ''}{evento.nombre}</h2>
          {evento.practica && <div className="aviso-practica">🧪 Evento de práctica: los QR funcionan igual que en un evento real. En la tarjeta impresa dice «PRÁCTICA».</div>}
          {evento.inscripcionesCerradas && <div className="advertencia">🔒 Las inscripciones de este evento están cerradas: solo se pueden crear QR de control de presentes.</div>}
          <div className="botones-fila">
            <button className="boton principal" disabled={!!evento.inscripcionesCerradas} onClick={() => abrirForm('cargar')}>+ QR de cargador</button>
            <button className="boton principal" onClick={() => abrirForm('presentes')}>+ QR de control de presentes</button>
          </div>
        </>
      )}

      {form && (
        <section className="panel-form">
          <h2>Nuevo QR · {TAREAS[form.tarea].nombre}</h2>
          {evento && !evento.practica && <AvisoPractica accion="generar QR para un evento real" />}
          <label className="campo">
            <span className="etiqueta">Nombre y apellido del colaborador</span>
            <input id="nombre-colaborador" list="colaboradores" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej.: Ana Pérez" />
            <datalist id="colaboradores">{datos.colaboradores.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="campo">
            <span className="etiqueta">Día</span>
            <input id="dia-acceso" type="date" value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
          </label>
          <div className="dos-columnas">
            <label className="campo">
              <span className="etiqueta">Desde</span>
              <input id="desde-acceso" type="time" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
            </label>
            <label className="campo">
              <span className="etiqueta">Hasta</span>
              <input id="hasta-acceso" type="time" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
            </label>
          </div>
          <p className="ayuda">Fuera de ese horario el celular no puede {form.tarea === 'cargar' ? 'cargar inscripciones' : 'marcar presentes'}. Lo que quede sin enviar se envía igual.</p>
          {error && <div className="error-grande" role="alert">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => { setForm(null); setError(''); }}>Cancelar</button>
            <button className="boton principal" disabled={ocupado || form.nombre.trim().length < 2} onClick={crear}>
              {ocupado ? 'Creando…' : 'Crear QR'}
            </button>
          </div>
        </section>
      )}

      {!form && error && <div className="error-grande" role="alert">{error}</div>}

      {!form && (
        <>
          <h3>QR de este evento</h3>
          {accesos.length === 0 && <p className="ayuda">Todavía no creaste ninguno.</p>}
          <ul className="lista">
            {accesos.map((a) => {
              const est = estadoDe(a);
              const abierto = !a.cerradoEn && new Date(a.hasta) > new Date();
              return (
                <li key={a.id} className="item">
                  <div className="item-titulo">{a.colaborador}</div>
                  <div className="item-detalle">{TAREAS[a.tarea].corto} · {horario(a)}</div>
                  <div className={`item-estado estado-${est.clase}`}>{est.texto}{a.tarea === 'cargar' ? ` · ${a.inscripciones} inscripciones recibidas` : ''}</div>
                  {abierto && aCerrar !== a.id && (
                    <button className="boton-chico" style={{ marginLeft: 0 }} onClick={() => setACerrar(a.id)}>Cerrar este QR</button>
                  )}
                  {aCerrar === a.id && (
                    <div className="advertencia">
                      ¿Cerrar el acceso de {a.colaborador}? Su celular no va a poder seguir trabajando (lo pendiente se envía igual).
                      <div>
                        <button className="boton-chico" onClick={() => setACerrar(null)}>No</button>
                        <button className="boton-chico peligro" disabled={ocupado} onClick={() => cerrar(a.id)}>Sí, cerrar</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="boton secundario" onClick={() => cargar()}>Actualizar</button>
          {api.autopresentes && evento && <AutopresentesQR api={api} evento={evento} />}
          {mostrarVolver && <p className="ayuda"><a href="/">Volver a la app</a></p>}
        </>
      )}
    </main>
  );
}
