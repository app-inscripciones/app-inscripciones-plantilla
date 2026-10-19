import { useCallback, useEffect, useState } from 'react';
import { rpc, mensajeError } from '../datos/panel.js';
import { formatoPesos } from '../logica/precios.js';
import { formatoFechaHora, etiquetaEvento } from '../logica/fechas.js';
import { nombreMedio as nombreDelMedio } from '../logica/validacion.js';
import { MomentosAsistencia } from './Configuracion.jsx';
import { esGrupo, nombreGrupo, nombreDeInscripcion, camposDelGrupo, camposDeIntegrante } from '../logica/grupo.js';

// Panel de control del evento (Etapa 4.2): inscriptos, dinero y efectivo por cargador (R9),
// y la lista de inscripciones para consultar. Solo cuenta lo que ya llegó a la base central.

export const nombreCategoria = (evento, id) => (evento.categorias.find((c) => c.id === id) || {}).nombre || (id ? id : 'Sin categoría');
export const nombreMedio = nombreDelMedio;
export function tituloInscripcion(evento, i) {
  if (esGrupo(evento)) return `${nombreDeInscripcion(i.datos) || 'Sin nombre'} (${(i.datos.integrantes || []).length})`;
  if (evento.unidad === 'pareja') return `${i.datos.hombre || '?'} y ${i.datos.mujer || '?'}`;
  return i.datos.nombre || 'Sin nombre';
}
const hace = (iso, ahora) => {
  if (!iso) return 'Nunca';
  const min = Math.round((new Date(ahora) - new Date(iso)) / 60000);
  if (min < 2) return 'Recién';
  if (min < 60) return `Hace ${min} min`;
  if (min < 48 * 60) return `Hace ${Math.round(min / 60)} h`;
  return formatoFechaHora(iso);
};

function Dato({ titulo, valor, detalle, destacado }) {
  return (
    <div className={`dato ${destacado ? 'destacado' : ''}`}>
      <span className="dato-titulo">{titulo}</span>
      <strong className="dato-valor">{valor}</strong>
      {detalle && <span className="dato-detalle">{detalle}</span>}
    </div>
  );
}

export function SelectorEvento({ eventos, eventoId, alElegir, archivados = 0, verArchivados = false, alVerArchivados }) {
  if (eventos.length <= 1 && !archivados) return null;
  return (
    <div className="selector-evento-fila">
      {eventos.length > 1 && (
        <label className="campo selector-evento">
          <span className="etiqueta">Evento</span>
          <select value={eventoId} onChange={(e) => alElegir(e.target.value)}>
            {eventos.map((e) => <option key={e.id} value={e.id}>{etiquetaEvento(e)}{e.archivadoEn ? ' (archivado)' : e.estado === 'cerrado' ? ' (cerrado)' : ''}</option>)}
          </select>
        </label>
      )}
      {archivados > 0 && alVerArchivados && (
        <label className="ver-archivados">
          <input type="checkbox" id="ver-archivados" checked={verArchivados} onChange={(e) => alVerArchivados(e.target.checked)} /> Ver archivados ({archivados})
        </label>
      )}
    </div>
  );
}

// R18 · Eventos híbridos: presenciales contra el cupo del lugar, virtuales, y los controles del Organizador.
export function CupoPresencial({ c, eventoId, puedeCambiar, alCambiar }) {
  const [editando, setEditando] = useState(false);
  const [cupo, setCupo] = useState(String(c.cupo ?? ''));
  const [pct, setPct] = useState(c.cierrePct ?? 0);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const usar = c.cupo ? Math.round((100 * c.presenciales) / c.cupo) : null;
  const nivel = c.cerradasEn ? 'cerrado' : usar !== null && usar >= c.avisoPct ? 'aviso' : '';
  const accion = async (p) => {
    setOcupado(true); setError('');
    const r = await rpc('panel_presenciales', { p_evento: eventoId, ...p });
    setOcupado(false);
    if (!r || !r.ok) { setError(mensajeError(r)); return; }
    setEditando(false); alCambiar();
  };
  return (
    <div className={`cupo-presencial ${nivel}`}>
      <h3>Presencial y virtual</h3>
      <div className="datos-grilla">
        <Dato titulo="Presenciales" valor={c.cupo ? `${c.presenciales} de ${c.cupo}` : c.presenciales}
          detalle={c.cupo ? `${usar} % del lugar · quedan ${c.quedan}` : 'Sin cupo cargado'} destacado={nivel !== ''} />
        <Dato titulo="Virtuales" valor={c.virtuales} detalle="No ocupan lugar en el salón" />
      </div>
      {c.cupo ? <div className="barra-cupo" aria-hidden="true"><i style={{ width: `${Math.min(100, usar)}%` }} /></div> : null}
      <p className="ayuda">Se cuentan personas{c.cupo ? `. Aviso al ${c.avisoPct} %` : ''}{c.cupo ? (c.cierrePct ? `; los lugares presenciales se cierran solos al ${c.cierrePct} %.` : '; no se cierran solos.') : '.'}</p>
      {c.cerradasEn ? (
        <div className="advertencia" role="status">🔒 <strong>Lugares presenciales cerrados</strong> desde el {formatoFechaHora(c.cerradasEn)}{c.cerradasPor ? ` (${c.cerradasPor})` : ''}. Los cargadores solo pueden inscribir en forma virtual.</div>
      ) : nivel === 'aviso' ? (
        <div className="advertencia" role="status">⚠️ El lugar está al {usar} %: quedan {c.quedan} lugares presenciales.</div>
      ) : null}
      {puedeCambiar && !editando && (
        <div className="botones-fila">
          {c.cerradasEn
            ? <button className="boton-chico" disabled={ocupado} onClick={() => accion({ p_accion: 'abrir' })}>Volver a abrir los lugares presenciales</button>
            : <button className="boton-chico" disabled={ocupado} onClick={() => accion({ p_accion: 'cerrar' })}>Cerrar los lugares presenciales</button>}
          <button className="boton-chico" onClick={() => setEditando(true)}>Cambiar el cupo</button>
        </div>
      )}
      {c.cerradasEn && puedeCambiar && c.cupo && c.cierrePct && c.presenciales >= Math.ceil((c.cupo * c.cierrePct) / 100) && (
        <p className="ayuda">Si volvés a abrir sin ampliar el cupo, se van a cerrar solos con la próxima inscripción presencial.</p>
      )}
      {editando && (
        <div className="panel-form">
          <label className="campo"><span className="etiqueta">Cupo presencial (personas)</span>
            <input id="nuevo-cupo" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          </label>
          <label className="campo"><span className="etiqueta">Cierre automático</span>
            <select id="nuevo-cierre" value={pct} onChange={(e) => setPct(Number(e.target.value))}>
              <option value={100}>Cerrar solos al 100 %</option>
              <option value={95}>Cerrar solos al 95 %</option>
              <option value={90}>Cerrar solos al 90 %</option>
              <option value={0}>No cerrar solos (solo avisar)</option>
            </select>
          </label>
          <div className="botones-fila">
            <button className="boton principal" disabled={ocupado || !(Number(cupo) >= 1)} onClick={() => accion({ p_accion: 'cupo', p_cupo: Number(cupo), p_pct: pct })}>Guardar</button>
            <button className="boton secundario" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <div className="error-grande">{error}</div>}
    </div>
  );
}

export function Resumen({ evento, alVerRevisar, puedeEditarMomentos }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    const x = await rpc('panel_resumen', { p_evento: evento.id });
    if (!x || !x.ok) { setError(mensajeError(x)); return; }
    setError(''); setR(x);
  }, [evento.id]);
  useEffect(() => { setR(null); cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, [cargar]);

  if (error) return <div className="error-grande">{error}</div>;
  if (!r) return <p>Cargando…</p>;
  const d = r.dinero;
  const aRendir = d.efectivo - d.rendido;
  const ticketsFaltan = (d.ticketsTerminal || 0) - (d.ticketsRendidos || 0);
  const revisar = r.paraRevisar ?? r.posiblesDuplicados + r.fueraDeHorario;
  return (
    <section>
      <div className="datos-grilla">
        <Dato titulo={esGrupo(evento) ? nombreGrupo(evento).Plural : 'Inscripciones'} valor={r.inscriptos}
          detalle={evento.unidad !== 'persona' ? `${r.personas} personas${r.anuladas ? ` · ${r.anuladas} anuladas (no suman)` : ''}` : r.anuladas ? `${r.anuladas} anuladas (no suman)` : null} />
        <Dato titulo="Dinero cobrado" valor={formatoPesos(d.total)} detalle={`Efectivo ${formatoPesos(d.efectivo)} · Terminal ${formatoPesos(d.terminal)} · Transf. ${formatoPesos(d.transferencia)}`} />
        <Dato titulo="Efectivo ya rendido" valor={formatoPesos(d.rendido)} />
        <Dato titulo="Efectivo pendiente de rendir" valor={formatoPesos(aRendir)} destacado={aRendir > 0 || ticketsFaltan > 0}
          detalle={ticketsFaltan > 0 ? `y ${ticketsFaltan} ${ticketsFaltan === 1 ? 'ticket' : 'tickets'} de terminal sin entregar` : null} />
      </div>
      {r.modalidad && r.modalidad.modalidad === 'hibrido' && (
        <CupoPresencial c={r.modalidad} eventoId={evento.id} puedeCambiar={puedeEditarMomentos} alCambiar={cargar} />
      )}
      {revisar > 0 && (
        <div className="advertencia">
          ⚠️ Hay {revisar} {revisar === 1 ? 'inscripción para revisar' : 'inscripciones para revisar'}
          {r.posiblesDuplicados ? ` · ${r.posiblesDuplicados} posible${r.posiblesDuplicados > 1 ? 's' : ''} duplicado${r.posiblesDuplicados > 1 ? 's' : ''}` : ''}
          {r.fueraDeHorario ? ` · ${r.fueraDeHorario} fuera de horario` : ''}
          {r.montoARevisar ? ` · ${r.montoARevisar} con monto distinto al precio` : ''}
          {r.sobreCupo ? ` · ${r.sobreCupo} presencial${r.sobreCupo > 1 ? 'es' : ''} sobre el cupo` : ''}.{' '}
          {alVerRevisar && <button className="boton-chico" onClick={alVerRevisar}>Ver</button>}
        </div>
      )}

      <h3>Efectivo por cargador</h3>
      {r.porCargador.length === 0 ? <p className="ayuda">Todavía no llegaron inscripciones.</p> : (
        <div className="tabla-scroll">
          <table className="tabla tabla-panel numeros">
            <thead>
              <tr><th>Cargador</th><th>Inscr.</th><th>Efectivo cobrado</th><th>Rendido</th><th>Falta rendir</th><th>Terminal</th><th>Transferencia</th><th>Última conexión</th></tr>
            </thead>
            <tbody>
              {r.porCargador.map((c) => (
                <tr key={c.cargador}>
                  <td>{c.cargador}</td>
                  <td>{c.inscripciones}</td>
                  <td>{formatoPesos(c.efectivo)}</td>
                  <td>{formatoPesos(c.rendido)}</td>
                  <td className={c.aRendir > 0 ? 'falta' : c.aRendir < 0 ? 'sobra' : ''}><strong>{formatoPesos(c.aRendir)}</strong></td>
                  <td>{formatoPesos(c.terminal)}</td>
                  <td>{formatoPesos(c.transferencia)}</td>
                  <td>{hace(c.ultimaConexion, r.ahora)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td><td>{r.inscriptos}</td><td>{formatoPesos(d.efectivo)}</td><td>{formatoPesos(d.rendido)}</td>
                <td><strong>{formatoPesos(aRendir)}</strong></td><td>{formatoPesos(d.terminal)}</td><td>{formatoPesos(d.transferencia)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="ayuda">
        Falta rendir = efectivo cobrado − efectivo ya rendido. Las inscripciones anuladas no suman. Se muestra solo lo que ya llegó a la base
        central: si un celular estuvo sin internet, mirá su «última conexión».
      </p>

      {r.porCategoria.length > 0 && evento.categorias.length > 0 && (
        <>
          <h3>Por categoría{esGrupo(evento) ? ' (personas)' : ''}</h3>
          <div className="barras">
            {r.porCategoria.map((c) => (
              <div key={c.categoria} className="barra-fila">
                <span>{nombreCategoria(evento, c.categoria)}</span>
                <span className="barra"><i style={{ width: `${Math.max(4, (100 * c.cantidad) / (esGrupo(evento) ? r.personas : r.inscriptos))}%` }} /></span>
                <strong>{c.cantidad}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {r.porDia.length > 0 && (
        <>
          <h3>Por día de carga</h3>
          <div className="barras">
            {r.porDia.map((x) => {
              const max = Math.max(...r.porDia.map((y) => y.cantidad));
              const [a, m, dd] = x.dia.split('-');
              return (
                <div key={x.dia} className="barra-fila">
                  <span>{dd}/{m}/{a}</span>
                  <span className="barra"><i style={{ width: `${Math.max(4, (100 * x.cantidad) / max)}%` }} /></span>
                  <strong>{x.cantidad}</strong>
                </div>
              );
            })}
          </div>
        </>
      )}
      <Presentes evento={evento} puedeEditar={puedeEditarMomentos} />
      <button className="boton secundario angosto-boton" onClick={cargar}>Actualizar</button>
    </section>
  );
}

function Presentes({ evento, puedeEditar }) {
  const [p, setP] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [editando, setEditando] = useState(false);
  const cargar = useCallback(() => rpc('panel_presentes', { p_evento: evento.id }).then((x) => setP(x && x.ok ? x : null)), [evento.id]);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, [cargar]);
  if (!p || p.asistencia.toma === false) return null;
  const hayMarcas = p.porInstancia.some((i) => i.presentes > 0);
  return (
    <>
      <h3>Presentes</h3>
      {!hayMarcas && <p className="ayuda">Todavía no se tomó asistencia.</p>}
      {puedeEditar && !editando && <button className="boton-chico" style={{ marginLeft: 0 }} onClick={() => setEditando(true)}>Editar momentos de asistencia</button>}
      {editando && (
        <MomentosAsistencia evento={evento} instancias={p.asistencia.instancias} conMarcas={new Set(p.marcas.map((m) => m.instancia))}
          alCancelar={() => setEditando(false)} alGuardar={() => { setEditando(false); cargar(); }} />
      )}
      <div className="tabla-scroll">
        <table className="tabla tabla-panel numeros">
          <thead><tr><th>Momento</th><th>Fecha</th><th>Presentes</th><th>Ausentes</th><th /></tr></thead>
          <tbody>
            {p.porInstancia.map((i) => (
              <tr key={i.id}>
                <td>{i.nombre}</td>
                <td>{i.fecha.split('-').reverse().join('/')}</td>
                <td><strong>{i.presentes}</strong> de {p.esperados}{i.seAnotaronSolos > 0 ? <small className="ayuda"> ({i.seAnotaronSolos} se anotaron solos con el QR)</small> : null}</td>
                <td>{i.ausentes.length}</td>
                <td>{i.ausentes.length > 0 && <button className="boton-chico" onClick={() => setAbierta(abierta === i.id ? null : i.id)}>{abierta === i.id ? 'Ocultar' : 'Ver ausentes'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierta && (() => {
        const i = p.porInstancia.find((x) => x.id === abierta);
        return (
          <div className="panel-form">
            <h4>Ausentes · {i.nombre} ({i.ausentes.length})</h4>
            <ul className="ausentes">
              {i.ausentes.map((a) => (
                <li key={a.n}>Nº {a.n} · <strong>{a.nombre}</strong>{a.personas > 1 ? ` (${a.personas})` : ''}{a.categoria ? ` · ${nombreCategoria(evento, a.categoria)}` : ''}{a.telefono ? ` · Tel. ${a.telefono}` : ''}</li>
              ))}
            </ul>
          </div>
        );
      })()}
    </>
  );
}

export function DetalleInscripcion({ evento, i, alCerrar, acciones }) {
  const grupo = esGrupo(evento);
  const campos = (grupo ? camposDelGrupo(evento) : evento.campos).filter((c) => i.datos[c.id] !== undefined && i.datos[c.id] !== '');
  const valor = (c, datos = i.datos) => {
    const v = datos[c.id];
    if (c.tipo === 'si_no') return v === 'si' ? 'Sí' : v === 'no' ? 'No' : v;
    if (c.opciones) return (c.opciones.find((o) => o.valor === v) || {}).etiqueta || v;
    return v;
  };
  return (
    <div className="detalle" role="dialog" aria-label="Detalle de la inscripción">
      <div className="detalle-encabezado">
        <h3>Nº {i.numeroOrden} · {tituloInscripcion(evento, i)}</h3>
        <button className="boton-chico" onClick={alCerrar}>Cerrar</button>
      </div>
      <div className="etiquetas">
        {i.estado === 'anulada' && <span className="etq gris">Anulada</span>}
        {i.estado === 'posible_duplicado' && <span className="etq amarilla">Posible duplicado{i.duplicadoDe ? ` de Nº ${i.duplicadoDe}` : ''}</span>}
        {i.fueraDeHorario && <span className="etq amarilla">Fuera de horario</span>}
        {i.sobreCupo && <span className="etq amarilla">Presencial sobre el cupo</span>}
        {i.montoRevisar && <span className="etq amarilla">Monto distinto al precio{i.montoEsperado != null ? `: correspondía ${formatoPesos(i.montoEsperado)}` : ''}</span>}
      </div>
      <dl className="revision">
        {!grupo && evento.categorias.length > 0 && (<><dt>Categoría</dt><dd>{nombreCategoria(evento, i.categoria)}</dd></>)}
        {campos.map((c) => (<div key={c.id}><dt>{c.etiqueta}</dt><dd>{valor(c)}</dd></div>))}
        {grupo && (
          <div>
            <dt>Integrantes ({(i.datos.integrantes || []).length})</dt>
            <dd>
              <ol className="lista-integrantes">
                {(i.datos.integrantes || []).map((x) => (
                  <li key={x.id}>
                    <strong>{x.nombre}</strong>{x.responsable ? ' ⭐ responsable' : ''}
                    {evento.categorias.length > 0 && x.categoria ? ` · ${nombreCategoria(evento, x.categoria)}` : ''}
                    {camposDeIntegrante(evento).filter((c) => c.id !== 'nombre' && x[c.id] !== undefined && x[c.id] !== '').map((c) => ` · ${c.etiqueta}: ${valor(c, x)}`).join('')}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        )}
        <dt>Cobrado</dt>
        <dd>{formatoPesos(i.monto)} · {nombreMedio(i.medioPago)}{i.medioPago === 'transferencia' ? ` · ${i.banco} · …${i.ultimos6}` : ''}</dd>
        {Array.isArray(i.conceptos) && i.conceptos.length > 0 && (
          <><dt>Detalle</dt><dd>{i.conceptos.map((c) => `${c.nombre || c.id}${c.cantidad > 1 ? ` × ${c.cantidad}` : ''}: ${formatoPesos(c.monto)}`).join(' · ')}</dd></>
        )}
        <dt>Cargado por</dt><dd>{i.cargador} · {formatoFechaHora(i.creadaEn)}</dd>
        <dt>Llegó a la base</dt><dd>{formatoFechaHora(i.recibidaEn)}</dd>
      </dl>
      {acciones}
    </div>
  );
}

export function ListaInscripciones({ evento, filtroInicial = 'todas', renderAcciones, version = 0 }) {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState(filtroInicial);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(async () => {
    const x = await rpc('panel_inscripciones', { p_evento: evento.id, p_buscar: buscar, p_filtro: filtro, p_limite: 300 });
    if (!x || !x.ok) { setError(mensajeError(x)); return; }
    setError(''); setLista(x.inscripciones);
  }, [evento.id, buscar, filtro]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar, version]);
  useEffect(() => { setFiltro(filtroInicial); }, [filtroInicial]);

  const recargarYcerrar = () => { setAbierta(null); cargar(); };

  return (
    <section>
      <div className="filtros">
        <input id="buscar-inscripcion" className="buscador" placeholder="Buscar por nombre, DNI, teléfono o Nº" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="opciones compacto" role="radiogroup" aria-label="Filtro">
          {[['todas', 'Todas'], ['revisar', 'Para revisar'], ['anuladas', 'Anuladas']].map(([v, t]) => (
            <button key={v} type="button" className={`opcion ${filtro === v ? 'elegida' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
      </div>
      {error && <div className="error-grande">{error}</div>}
      {!lista ? <p>Cargando…</p> : lista.length === 0 ? <p className="ayuda">No hay inscripciones para mostrar.</p> : (
        <div className="tabla-scroll">
          <table className="tabla tabla-panel">
            <thead><tr><th>Nº</th><th>{esGrupo(evento) ? nombreGrupo(evento).Singular : evento.unidad === 'pareja' ? 'Pareja' : 'Nombre'}</th>{evento.categorias.length > 0 && !esGrupo(evento) && <th>Categoría</th>}<th>Cobrado</th><th>Cargador</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className={`fila-click ${i.estado === 'anulada' ? 'inactivo' : ''}`} onClick={() => setAbierta(i)}>
                  <td>{i.numeroOrden}</td>
                  <td>{tituloInscripcion(evento, i)}</td>
                  {evento.categorias.length > 0 && !esGrupo(evento) && <td>{nombreCategoria(evento, i.categoria)}</td>}
                  <td>{formatoPesos(i.monto)} · {nombreMedio(i.medioPago)}</td>
                  <td>{i.cargador}</td>
                  <td>
                    {i.estado === 'anulada' ? 'Anulada' : i.estado === 'posible_duplicado' ? '⚠️ Posible duplicado' : 'Activa'}
                    {i.fueraDeHorario && i.estado !== 'anulada' ? ' · ⚠️ Fuera de horario' : ''}
                    {i.montoRevisar && i.estado !== 'anulada' ? ' · ⚠️ Monto a revisar' : ''}
                    {i.sobreCupo && i.estado !== 'anulada' ? ' · ⚠️ Sobre el cupo' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista && lista.length >= 300 && <p className="ayuda">Se muestran las 300 más recientes. Usá el buscador para encontrar otras.</p>}
      {abierta && (
        <div className="fondo-modal" onClick={(e) => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <DetalleInscripcion evento={evento} i={abierta} alCerrar={() => setAbierta(null)}
            acciones={renderAcciones ? renderAcciones(abierta, recargarYcerrar) : null} />
        </div>
      )}
    </section>
  );
}
