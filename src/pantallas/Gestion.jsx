import { useCallback, useEffect, useState } from 'react';
import { rpc, mensajeError } from '../datos/panel.js';
import { formatoPesos } from '../logica/precios.js';
import { formatoFechaHora } from '../logica/fechas.js';
import { MEDIOS_PAGO } from '../logica/validacion.js';
import { AvisoPractica } from './AvisoPractica.jsx';
import { esGrupo, camposDelGrupo, camposDeIntegrante, nuevoIntegrante, nombreGrupo } from '../logica/grupo.js';

// Etapas 4.3 y 4.4: rendiciones (Tesorero) y correcciones, anulaciones y revisiones (Organizador).

const MENSAJES = {}; // todos los mensajes están en src/datos/mensajes.js
const msj = (r) => mensajeError(r, MENSAJES);
const soloNumeros = (t) => Number(String(t).replace(/\D/g, '')) || 0;

// ---------------- 4.3 Rendiciones ----------------
export function Rendiciones({ evento, puedeRegistrar }) {
  const [resumen, setResumen] = useState(null);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [aAnular, setAAnular] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([rpc('panel_resumen', { p_evento: evento.id }), rpc('panel_rendiciones', { p_evento: evento.id })]);
    if (!a || !a.ok) { setError(msj(a)); return; }
    if (!b || !b.ok) { setError(msj(b)); return; }
    setError(''); setResumen(a); setLista(b.rendiciones);
  }, [evento.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const registrar = async () => {
    setOcupado(true); setError('');
    const r = await rpc('panel_registrar_rendicion', { p_evento: evento.id, p_cargador: form.cargador, p_monto: soloNumeros(form.monto), p_observacion: form.observacion, p_tickets: soloNumeros(form.tickets) });
    setOcupado(false);
    if (!r || !r.ok) { setError(msj(r)); return; }
    const entrego = [soloNumeros(form.monto) > 0 && formatoPesos(soloNumeros(form.monto)), soloNumeros(form.tickets) > 0 && `${soloNumeros(form.tickets)} ${soloNumeros(form.tickets) === 1 ? 'ticket' : 'tickets'} de terminal`].filter(Boolean).join(' y ');
    const falta = [formatoPesos(r.aRendir), r.ticketsPendientes ? `${r.ticketsPendientes} ${r.ticketsPendientes === 1 ? 'ticket' : 'tickets'}` : null].filter(Boolean).join(' y ');
    setAviso(`✅ Rendición registrada: ${form.cargador} entregó ${entrego}. Le queda por rendir ${falta}.`);
    setForm(null); cargar();
  };
  const anular = async () => {
    setOcupado(true); setError('');
    const r = await rpc('panel_anular_rendicion', { p_id: aAnular.id, p_motivo: motivo });
    setOcupado(false);
    if (!r || !r.ok) { setError(msj(r)); return; }
    setAAnular(null); setMotivo(''); setAviso('Rendición anulada. Quedó registrado.'); cargar();
  };

  if (!resumen) return error ? <div className="error-grande">{error}</div> : <p>Cargando…</p>;

  if (form) {
    const c = resumen.porCargador.find((x) => x.cargador === form.cargador);
    const monto = soloNumeros(form.monto);
    const tickets = soloNumeros(form.tickets);
    const pendTickets = c ? c.ticketsPendientes || 0 : 0;
    return (
      <section className="panel-form angosto-form">
        <h2>Registrar rendición</h2>
        {!evento.practica && <AvisoPractica rol="tesorero" accion="registrar una entrega real" />}
        <p><strong>{form.cargador}</strong> · le falta rendir <strong>{formatoPesos(c ? c.aRendir : 0)}</strong> en efectivo
          {pendTickets > 0 && <> y <strong>{pendTickets} {pendTickets === 1 ? 'ticket' : 'tickets'}</strong> de la terminal</>}.</p>
        <label className="campo">
          <span className="etiqueta">¿Cuánto efectivo entregó?</span>
          <input id="monto-rendicion" inputMode="numeric" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value.replace(/[^\d]/g, '') })} />
        </label>
        <label className="campo">
          <span className="etiqueta">¿Cuántos tickets en papel de la terminal entregó?</span>
          <input id="tickets-rendicion" inputMode="numeric" value={form.tickets} onChange={(e) => setForm({ ...form, tickets: e.target.value.replace(/[^\d]/g, '').slice(0, 5) })} />
          <small className="ayuda">Un ticket por cada cobro con terminal. El cargador tiene la lista en «Resumen para rendir».</small>
        </label>
        {tickets > pendTickets && <div className="advertencia">Son más tickets de los que figuran pendientes ({pendTickets}). Puede faltar que el celular envíe alguna inscripción.</div>}
        {c && monto > c.aRendir && (
          <div className="advertencia">El monto es mayor a lo que figura pendiente. Puede pasar si el celular del cargador todavía no envió todo: pedile que se conecte a internet y tocá «Actualizar» antes de registrar.</div>
        )}
        <label className="campo">
          <span className="etiqueta">Observación (opcional)</span>
          <input id="obs-rendicion" value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} placeholder="Ej.: entrega parcial del sábado" />
        </label>
        {error && <div className="error-grande" role="alert">{error}</div>}
        <div className="botones-barra">
          <button className="boton secundario" onClick={() => { setForm(null); setError(''); }}>Cancelar</button>
          <button id="registrar-rendicion" className="boton principal" disabled={ocupado || (monto <= 0 && tickets <= 0)} onClick={registrar}>{ocupado ? 'Guardando…' : `Registrar ${[monto > 0 && formatoPesos(monto), tickets > 0 && `${tickets} ${tickets === 1 ? 'ticket' : 'tickets'}`].filter(Boolean).join(' y ') || formatoPesos(0)}`}</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {aviso && <div className="exito" role="status">{aviso}</div>}
      {error && <div className="error-grande" role="alert">{error}</div>}
      <h3>Lo que tiene que rendir cada cargador</h3>
      {resumen.porCargador.length === 0 ? <p className="ayuda">Todavía no hay cobros.</p> : (
        <div className="tabla-scroll">
          <table className="tabla tabla-panel numeros">
            <thead><tr><th>Cargador</th><th>Efectivo cobrado</th><th>Rendido</th><th>Falta rendir</th><th>Tickets terminal</th><th>Faltan tickets</th><th /></tr></thead>
            <tbody>
              {resumen.porCargador.map((c) => (
                <tr key={c.cargador}>
                  <td>{c.cargador}</td><td>{formatoPesos(c.efectivo)}</td><td>{formatoPesos(c.rendido)}</td>
                  <td className={c.aRendir > 0 ? 'falta' : c.aRendir < 0 ? 'sobra' : ''}><strong>{formatoPesos(c.aRendir)}</strong></td>
                  <td>{c.ticketsTerminal ?? 0}</td>
                  <td className={c.ticketsPendientes > 0 ? 'falta' : c.ticketsPendientes < 0 ? 'sobra' : ''}><strong>{c.ticketsPendientes ?? 0}</strong></td>
                  <td>{puedeRegistrar && (
                    <button className="boton-chico" onClick={() => { setAviso(''); setForm({ cargador: c.cargador, monto: c.aRendir > 0 ? String(c.aRendir) : '', tickets: c.ticketsPendientes > 0 ? String(c.ticketsPendientes) : '', observacion: '' }); }}>Registrar entrega</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resumen.porCargador.some((c) => c.aRendir < 0) && (
        <p className="ayuda">Un monto negativo en «Falta rendir» significa que se rindió de más (por ejemplo, porque después se anuló una inscripción en efectivo): hay que devolverle esa diferencia al cargador o revisar las rendiciones.</p>
      )}
      {resumen.porCargador.some((c) => c.ticketsPendientes < 0) && (
        <p className="ayuda">Un número negativo en «Faltan tickets» significa que el cargador entregó tickets de más (por ejemplo, porque después se anuló una inscripción cobrada con la terminal): ese ticket corresponde a un cobro anulado; guardalo junto con el motivo de la anulación.</p>
      )}
      {!puedeRegistrar && <p className="ayuda">Solo el Tesorero puede registrar rendiciones.</p>}

      <h3>Historial de rendiciones</h3>
      {lista.length === 0 ? <p className="ayuda">Todavía no se registró ninguna.</p> : (
        <div className="tabla-scroll">
          <table className="tabla tabla-panel">
            <thead><tr><th>Fecha</th><th>Cargador</th><th>Efectivo</th><th>Tickets</th><th>Recibió</th><th>Observación</th><th /></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} className={x.anulada ? 'inactivo' : ''}>
                  <td>{formatoFechaHora(x.entregadoEn)}</td><td>{x.cargador}</td><td>{formatoPesos(x.monto)}</td><td>{x.tickets || 0}</td><td>{x.recibidoPor}</td>
                  <td>{x.anulada ? `Anulada: ${x.anuladaMotivo}` : x.observacion || ''}</td>
                  <td>{puedeRegistrar && !x.anulada && <button className="boton-chico" onClick={() => { setAAnular(x); setMotivo(''); }}>Anular</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aAnular && (
        <div className="advertencia">
          ¿Anular la rendición de {aAnular.cargador} por {formatoPesos(aAnular.monto)}{aAnular.tickets ? ` y ${aAnular.tickets} ${aAnular.tickets === 1 ? 'ticket' : 'tickets'}` : ''}? Vuelve a figurar como pendiente.
          <label className="campo"><span className="etiqueta">Motivo</span>
            <input id="motivo-anular-rendicion" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se cargó dos veces" />
          </label>
          <button className="boton-chico" onClick={() => setAAnular(null)}>No</button>
          <button className="boton-chico peligro" disabled={ocupado || motivo.trim().length < 3} onClick={anular}>Sí, anular</button>
        </div>
      )}
      <button className="boton secundario angosto-boton" onClick={cargar}>Actualizar</button>
    </section>
  );
}

// ---------------- 4.4 Acciones sobre una inscripción ----------------
function Historial({ id }) {
  const [cambios, setCambios] = useState(null);
  useEffect(() => { rpc('panel_historial', { p_entidad: 'inscripcion', p_id: id }).then((r) => setCambios(r && r.ok ? r.cambios : [])); }, [id]);
  const NOMBRES = { corregir_inscripcion: 'Corrección', anular_inscripcion: 'Anulación', marcar_revisada: 'Revisada', quitar_presente: 'Se quitó un presente' };
  if (!cambios) return null;
  if (cambios.length === 0) return <p className="ayuda">Sin cambios desde que se cargó.</p>;
  return (
    <ul className="historial">
      {cambios.map((c, k) => (
        <li key={k}><strong>{NOMBRES[c.accion] || c.accion}</strong> · {formatoFechaHora(c.cuando)} · {c.quien}{c.despues && c.despues.motivo ? ` · «${c.despues.motivo}»` : ''}</li>
      ))}
    </ul>
  );
}

function PresentesDeInscripcion({ evento, i, puedeQuitar, alCambiar }) {
  const [p, setP] = useState(null);
  const [aQuitar, setAQuitar] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const cargar = useCallback(() => rpc('panel_presentes', { p_evento: evento.id }).then((x) => setP(x && x.ok ? x : null)), [evento.id]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!p || p.asistencia.toma === false) return null;
  const mias = p.marcas.filter((m) => m.inscripcionId === i.id);
  const nombreInst = (id) => (p.porInstancia.find((x) => x.id === id) || {}).nombre || id;
  const quitar = async () => {
    const r = await rpc('panel_quitar_presente', { p_marca: aQuitar, p_motivo: motivo });
    if (!r || !r.ok) { setError(msj(r)); return; }
    setAQuitar(null); setMotivo(''); setError(''); cargar(); if (alCambiar) alCambiar();
  };
  return (
    <>
      <h4>Asistencia</h4>
      {mias.length === 0 ? <p className="ayuda">Sin presentes registrados.</p> : (
        <ul className="historial">
          {mias.map((m) => (
            <li key={m.id}>✓ <strong>{nombreInst(m.instancia)}</strong>{m.persona ? ` (${m.persona === 'hombre' ? 'él' : m.persona === 'mujer' ? 'ella' : ((i.datos.integrantes || []).find((x) => x.id === m.persona) || {}).nombre || m.persona})` : ''} · {formatoFechaHora(m.marcadaEn)} · {m.marcadoPor}
              {puedeQuitar && <button className="boton-chico" onClick={() => { setAQuitar(m.id); setMotivo(''); }}>Quitar</button>}
            </li>
          ))}
        </ul>
      )}
      {aQuitar && (
        <div className="advertencia">
          ¿Quitar esta marca de presente?
          <label className="campo"><span className="etiqueta">Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <button className="boton-chico" onClick={() => setAQuitar(null)}>No</button>
          <button className="boton-chico peligro" disabled={motivo.trim().length < 3} onClick={quitar}>Sí, quitar</button>
        </div>
      )}
    </>
  );
}

// Campos para corregir: texto en una caja; Sí/No y listas como botones.
function CamposEditables({ campos, datos, cambiar, prefijo = '' }) {
  return (
    <>
      {campos.filter((c) => c.tipo !== 'si_no' && !c.opciones).map((c) => (
        <label key={c.id} className="campo">
          <span className="etiqueta">{c.etiqueta}</span>
          <input id={prefijo ? `${prefijo}-${c.id}` : undefined} value={datos[c.id] || ''} onChange={(e) => cambiar(c.id, e.target.value)} />
        </label>
      ))}
      {campos.filter((c) => c.tipo === 'si_no' || c.opciones).map((c) => {
        const ops = c.opciones || [{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }];
        return (
          <fieldset key={c.id} className="campo">
            <legend className="etiqueta">{c.etiqueta}</legend>
            <div className="opciones compacto">
              {ops.map((o) => (
                <button key={o.valor} type="button" className={`opcion ${datos[c.id] === o.valor ? 'elegida' : ''}`} onClick={() => cambiar(c.id, o.valor)}>{o.etiqueta}</button>
              ))}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

// Grupos (D61, alternativa A): reemplazar integrantes siempre; agregar o quitar dentro del mínimo y máximo
// solo si el monto no cambia (la base lo controla y avisa).
function IntegrantesEditables({ evento, datos, setDatos }) {
  const lista = datos.integrantes || [];
  const g = evento.grupo || {};
  const fijar = (nueva) => setDatos({ ...datos, integrantes: nueva });
  const cambiar = (id, campo, v) => fijar(lista.map((x) => (x.id === id ? { ...x, [campo]: v } : x)));
  const responsable = (id) => fijar(lista.map((x) => { const { responsable: _, ...r } = x; return x.id === id ? { ...r, responsable: true } : r; }));
  const n = nombreGrupo(evento);
  return (
    <div className="integrantes">
      <h4>Integrantes ({lista.length})</h4>
      <p className="ayuda">
        Podés cambiar los datos de cualquier integrante (por ejemplo, reemplazar a uno por otro).
        {g.cobro === 'integrante'
          ? ' Agregar o quitar integrantes cambia el monto, así que no se puede: si hace falta, anulá y cargá de nuevo.'
          : ` Agregar o quitar integrantes se puede (cada ${n.singular} paga lo mismo), entre ${g.min} y ${g.max}.`}
      </p>
      {lista.map((x, k) => (
        <div key={x.id} className={`integrante ${x.responsable ? 'responsable' : ''}`}>
          <div className="integrante-titulo">
            <strong>Integrante {k + 1}</strong>
            {x.responsable ? <span className="marca-responsable">⭐ Responsable</span>
              : <button type="button" className="boton-chico" onClick={() => responsable(x.id)}>Hacer responsable</button>}
            {lista.length > (g.min || 1) && <button type="button" className="boton-chico peligro" aria-label={`Quitar integrante ${k + 1}`}
              onClick={() => fijar(lista.filter((y) => y.id !== x.id).map((y, j, todos) => (todos.some((z) => z.responsable) || j > 0 ? y : { ...y, responsable: true })))}>Quitar</button>}
          </div>
          {evento.categorias.length > 0 && (
            <fieldset className="campo">
              <legend className="etiqueta">Categoría</legend>
              <div className="opciones compacto">
                {evento.categorias.map((c) => (
                  <button key={c.id} type="button" className={`opcion ${x.categoria === c.id ? 'elegida' : ''}`} onClick={() => cambiar(x.id, 'categoria', c.id)}>{c.nombre}</button>
                ))}
              </div>
            </fieldset>
          )}
          <CamposEditables campos={camposDeIntegrante(evento)} datos={x} prefijo={`corr-${x.id}`} cambiar={(campo, v) => cambiar(x.id, campo, v)} />
        </div>
      ))}
      {(!g.max || lista.length < g.max) && (
        <button type="button" className="boton secundario" id="corregir-agregar-integrante" onClick={() => fijar([...lista, nuevoIntegrante(lista)])}>+ Agregar integrante</button>
      )}
    </div>
  );
}

export function AccionesInscripcion({ evento, i, puedeCorregir, alTerminar }) {
  const [modo, setModo] = useState(''); // '' | 'corregir' | 'anular' | 'revisar'
  const [datos, setDatos] = useState(i.datos);
  const [pago, setPago] = useState({ medio: i.medioPago, banco: i.banco || '', ultimos6: i.ultimos6 || '' });
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const paraRevisar = i.estado === 'posible_duplicado' || i.fueraDeHorario || i.montoRevisar || i.sobreCupo;

  const ejecutar = async (nombre, params) => {
    setOcupado(true); setError('');
    const r = await rpc(nombre, params);
    setOcupado(false);
    if (!r || !r.ok) { setError(msj(r)); return; }
    alTerminar();
  };

  const campoMotivo = (
    <label className="campo"><span className="etiqueta">Motivo (queda registrado)</span>
      <input id="motivo-accion" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </label>
  );

  return (
    <div className="acciones-inscripcion">
      <PresentesDeInscripcion evento={evento} i={i} puedeQuitar={puedeCorregir} />
      <h4>Historial de cambios</h4>
      <Historial id={i.id} />
      {puedeCorregir && i.estado !== 'anulada' && modo === '' && (
        <div className="botones-fila">
          {paraRevisar && <button className="boton principal" onClick={() => { setModo('revisar'); setMotivo(''); }}>✓ Revisada: está bien</button>}
          <button className="boton secundario" onClick={() => setModo('corregir')}>{i.medioPago === 'sin_cobro' ? 'Corregir datos' : 'Corregir datos o medio de pago'}</button>
          <button className="boton secundario peligro-borde" onClick={() => { setModo('anular'); setMotivo(''); }}>Anular inscripción</button>
        </div>
      )}
      {modo === 'revisar' && (
        <div className="panel-form">
          <p>{i.estado === 'posible_duplicado' ? 'Confirmás que NO es la misma persona que la otra inscripción (por ejemplo, son familiares)' : 'Confirmás que se acepta aunque se cargó fuera del horario'}. La marca se quita.</p>
          {campoMotivo}
          {error && <div className="error-grande">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => setModo('')}>Cancelar</button>
            <button className="boton principal" disabled={ocupado} onClick={() => ejecutar('panel_marcar_revisada', { p_id: i.id, p_motivo: motivo })}>Confirmar</button>
          </div>
        </div>
      )}
      {modo === 'anular' && (
        <div className="panel-form">
          <p>La inscripción deja de contar en inscriptos y dinero{i.medioPago === 'efectivo' ? `, y se descuentan ${formatoPesos(i.monto)} de lo que ${i.cargador} tiene que rendir` : ''}. No se borra: queda como anulada.</p>
          <p className="ayuda">Si el error fue de categoría o precio, después cargá la inscripción de nuevo con un QR.</p>
          {campoMotivo}
          {error && <div className="error-grande">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => setModo('')}>Cancelar</button>
            <button className="boton principal peligro-fondo" disabled={ocupado || motivo.trim().length < 3} onClick={() => ejecutar('panel_anular_inscripcion', { p_id: i.id, p_motivo: motivo })}>Sí, anular</button>
          </div>
        </div>
      )}
      {modo === 'corregir' && (
        <div className="panel-form">
          <p className="ayuda">Se pueden corregir los datos y el medio de pago. El monto ({formatoPesos(i.monto)}) no se cambia: si está mal, anulá y cargá de nuevo.</p>
          <CamposEditables campos={esGrupo(evento) ? camposDelGrupo(evento) : evento.campos} datos={datos} cambiar={(id, v) => setDatos({ ...datos, [id]: v })} />
          {esGrupo(evento) && <IntegrantesEditables evento={evento} datos={datos} setDatos={setDatos} />}
          {i.medioPago !== 'sin_cobro' && (<fieldset className="campo">
            <legend className="etiqueta">Medio de pago</legend>
            <div className="opciones compacto">
              {MEDIOS_PAGO.map((m) => (
                <button key={m.valor} type="button" className={`opcion ${pago.medio === m.valor ? 'elegida' : ''}`} onClick={() => setPago({ ...pago, medio: m.valor })}>{m.etiqueta}</button>
              ))}
            </div>
          </fieldset>)}
          {pago.medio === 'transferencia' && (
            <div className="dos-columnas">
              <label className="campo"><span className="etiqueta">Banco o billetera</span><input value={pago.banco} onChange={(e) => setPago({ ...pago, banco: e.target.value })} /></label>
              <label className="campo"><span className="etiqueta">Últimos 6</span><input value={pago.ultimos6} maxLength={6} onChange={(e) => setPago({ ...pago, ultimos6: e.target.value.toUpperCase() })} /></label>
            </div>
          )}
          {campoMotivo}
          {error && <div className="error-grande">{error}</div>}
          <div className="botones-barra">
            <button className="boton secundario" onClick={() => setModo('')}>Cancelar</button>
            <button className="boton principal" disabled={ocupado || motivo.trim().length < 3}
              onClick={() => ejecutar('panel_corregir_inscripcion', { p_id: i.id, p_datos: datos, p_medio: pago.medio, p_banco: pago.banco, p_ultimos6: pago.ultimos6, p_motivo: motivo })}>
              Guardar corrección
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
