import { useEffect, useState } from 'react';
import { rpc, mensajeError } from '../datos/panel.js';
import { useInstitucion, fijarInstitucion, actualizarInstitucion, prepararLogo } from '../datos/institucion.js';

// D35: datos de la institución (Responsable general). D32: momentos de asistencia (Organizador).

const MENSAJES = {
  datos_invalidos: 'Revisá los datos: el nombre tiene que tener al menos 2 letras y los colores, el formato #RRGGBB.',
};

export function Institucion({ alGuardar }) {
  const actual = useInstitucion();
  const [f, setF] = useState(() => ({
    nombre: actual.configurada ? actual.nombre : '',
    nombreApp: actual.nombreApp || 'Inscripciones',
    colorPrincipal: actual.colorPrincipal,
    colorFondo: actual.colorFondo,
    logo: actual.logo,
    avisoSalud: actual.avisoSalud || '',
    contacto: actual.contacto || '',
  }));
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');

  const elegirLogo = async (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo) return;
    try { setF({ ...f, logo: await prepararLogo(archivo) }); setError(''); } catch (x) { setError(x.message); }
  };

  const guardar = async () => {
    setEstado('guardando'); setError('');
    const r = await rpc('panel_guardar_institucion', {
      p_nombre: f.nombre, p_nombre_app: f.nombreApp, p_color_principal: f.colorPrincipal, p_color_fondo: f.colorFondo,
      p_logo: f.logo || null, p_aviso_salud: f.avisoSalud, p_contacto: f.contacto,
    });
    if (!r || !r.ok) { setEstado(''); setError(mensajeError(r, MENSAJES)); return; }
    await actualizarInstitucion();
    fijarInstitucion({ configurada: true, ...f });
    setEstado('listo');
    if (alGuardar) alGuardar();
  };

  return (
    <section className="panel-form angosto-form">
      <h2>Datos de la institución</h2>
      <p className="ayuda">Aparecen en todas las pantallas de la app. Se pueden cambiar cuando quieras.</p>
      <label className="campo"><span className="etiqueta">Nombre de la institución</span>
        <input id="inst-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Colegio San Martín" />
      </label>
      <label className="campo"><span className="etiqueta">Nombre corto de la app</span>
        <input id="inst-app" value={f.nombreApp} maxLength={40} onChange={(e) => setF({ ...f, nombreApp: e.target.value })} />
      </label>
      <div className="dos-columnas">
        <label className="campo"><span className="etiqueta">Color principal</span>
          <input type="color" className="color" value={f.colorPrincipal} onChange={(e) => setF({ ...f, colorPrincipal: e.target.value.toUpperCase() })} />
        </label>
        <label className="campo"><span className="etiqueta">Color de fondo</span>
          <input type="color" className="color" value={f.colorFondo} onChange={(e) => setF({ ...f, colorFondo: e.target.value.toUpperCase() })} />
        </label>
      </div>
      <div className="campo">
        <span className="etiqueta">Logo (opcional)</span>
        <div className="fila-logo">
          {f.logo ? <img src={f.logo} alt="Logo" className="logo-previa" /> : <span className="ayuda">Sin logo</span>}
          <label className="boton-chico">Elegir imagen<input type="file" accept="image/*" hidden onChange={elegirLogo} /></label>
          {f.logo && <button className="boton-chico" onClick={() => setF({ ...f, logo: null })}>Quitar</button>}
        </div>
      </div>
      <label className="campo"><span className="etiqueta">Aviso sobre datos de salud (se muestra en el formulario)</span>
        <input id="inst-aviso" value={f.avisoSalud} onChange={(e) => setF({ ...f, avisoSalud: e.target.value })} />
      </label>
      <label className="campo"><span className="etiqueta">Contacto (opcional)</span>
        <input id="inst-contacto" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} placeholder="Correo o teléfono de la secretaría" />
      </label>
      <div className="vista-previa" style={{ background: f.colorFondo }}>
        <div className="encabezado" style={{ background: f.colorPrincipal, position: 'static' }}>
          <div className="marca">
            {f.logo && <img src={f.logo} alt="" className="marca-logo" />}
            <div><div className="app">{f.nombreApp} · {f.nombre || 'Nombre de la institución'}</div><div className="evento">Así se va a ver</div></div>
          </div>
        </div>
        <div style={{ padding: 10 }}><span className="boton principal" style={{ background: f.colorPrincipal, borderColor: f.colorPrincipal, maxWidth: 220 }}>+ Nueva inscripción</span></div>
      </div>
      {error && <div className="error-grande" role="alert">{error}</div>}
      {estado === 'listo' && <div className="exito">✅ Guardado. Los celulares lo toman la próxima vez que abran la app con internet.</div>}
      <button className="boton principal" disabled={estado === 'guardando' || f.nombre.trim().length < 2} onClick={guardar}>
        {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
      </button>
    </section>
  );
}

const TURNOS = [['', 'Todo el día'], ['mañana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];

export function MomentosAsistencia({ evento, instancias, conMarcas, alGuardar, alCancelar }) {
  const [lista, setLista] = useState(() => instancias.map((i) => ({ ...i, turno: i.turno || '' })));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setError(''); }, [lista]);
  const cambiar = (k, campo, v) => setLista(lista.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));

  const guardar = async () => {
    setOcupado(true);
    const r = await rpc('panel_guardar_instancias', { p_evento: evento.id, p_instancias: lista.map(({ id, nombre, fecha, turno }) => ({ id, nombre, fecha, turno })) });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    alGuardar();
  };

  return (
    <div className="panel-form">
      <h4>Momentos en que se toma asistencia</h4>
      <p className="ayuda">Podés agregar momentos con el evento abierto (por ejemplo, una reunión extra). Los que ya tienen presentes marcados no se pueden cambiar ni borrar.</p>
      {lista.map((x, k) => {
        const bloqueado = conMarcas.has(x.id);
        return (
          <div key={x.id || `nuevo-${k}`} className="fila-momento">
            <input aria-label="Nombre" value={x.nombre} disabled={bloqueado} onChange={(e) => cambiar(k, 'nombre', e.target.value)} placeholder="Ej.: Sábado noche – culto" />
            <input aria-label="Fecha" type="date" value={x.fecha} disabled={bloqueado} onChange={(e) => cambiar(k, 'fecha', e.target.value)} />
            <select aria-label="Turno" value={x.turno} disabled={bloqueado} onChange={(e) => cambiar(k, 'turno', e.target.value)}>
              {TURNOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            {bloqueado ? <span className="ayuda">🔒 con marcas</span> : lista.length > 1 && <button className="boton-chico" onClick={() => setLista(lista.filter((_, j) => j !== k))}>Quitar</button>}
          </div>
        );
      })}
      <button className="boton-chico" style={{ marginLeft: 0 }} onClick={() => setLista([...lista, { nombre: '', fecha: evento.fecha, turno: '' }])}>+ Agregar momento</button>
      {error && <div className="error-grande">{error}</div>}
      <div className="botones-barra">
        <button className="boton secundario" onClick={alCancelar}>Cancelar</button>
        <button className="boton principal" disabled={ocupado || lista.some((x) => (x.nombre || '').trim().length < 2 || !x.fecha)} onClick={guardar}>Guardar</button>
      </div>
    </div>
  );
}
