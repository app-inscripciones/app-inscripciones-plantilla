import { useMemo, useState } from 'react';
import { useInstitucion } from '../datos/institucion.js';
import { campoVisible, limpiarRespuestas } from '../logica/reglas.js';
import { calcularCobro, formatoPesos } from '../logica/precios.js';
import { validar, avisos as calcularAvisos, MEDIOS_PAGO, SIN_COBRO, esSinCobro, claveIntegrante } from '../logica/validacion.js';
import { esGrupo, camposDelGrupo, camposDeIntegrante, nuevoIntegrante, nombreGrupo, respuestasDeIntegrante } from '../logica/grupo.js';
import { diaLocal } from '../logica/fechas.js';
import { guardarInscripcion, nuevoId } from '../datos/db.js';

function Opciones({ opciones, valor, alElegir, nombre }) {
  return (
    <div className="opciones" role="radiogroup" aria-label={nombre}>
      {opciones.map((o) => (
        <button
          type="button"
          key={o.valor}
          role="radio"
          aria-checked={valor === o.valor}
          className={`opcion ${valor === o.valor ? 'elegida' : ''}`}
          disabled={!!o.deshabilitada}
          onClick={() => alElegir(o.valor)}
        >
          {o.etiqueta}{o.deshabilitada ? ` (${o.deshabilitada})` : ''}
        </button>
      ))}
    </div>
  );
}

const SI_NO = [
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
];

function Campo({ campo, valor, error, alCambiar, presencialesCerradas }) {
  let control;
  if (campo.tipo === 'si_no' || campo.tipo === 'opcion') {
    // R18: con los lugares presenciales completos, solo se puede elegir «Virtual».
    const opciones = campo.id === 'modalidad' && presencialesCerradas
      ? campo.opciones.map((o) => (o.valor === 'presencial' ? { ...o, deshabilitada: 'completo' } : o))
      : campo.opciones;
    control = (
      <Opciones nombre={campo.etiqueta} opciones={campo.tipo === 'si_no' ? SI_NO : opciones} valor={valor} alElegir={alCambiar} />
    );
  } else {
    const tipos = {
      telefono: { type: 'tel', inputMode: 'tel', autoComplete: 'off' },
      dni: { type: 'text', inputMode: 'numeric', autoComplete: 'off' },
      numero: { type: 'text', inputMode: 'numeric', autoComplete: 'off' },
      texto: { type: 'text', autoComplete: 'off' },
    };
    control = (
      <input
        id={campo.id}
        value={valor ?? ''}
        onChange={(e) => alCambiar(e.target.value)}
        aria-invalid={!!error}
        {...(tipos[campo.tipo] || tipos.texto)}
      />
    );
  }
  return (
    <div className={`campo ${error ? 'con-error' : ''}`}>
      <label className="etiqueta" htmlFor={campo.id}>
        {campo.etiqueta}
        {campo.obligatorio ? <span className="obligatorio"> *</span> : <span className="opcional"> (opcional)</span>}
      </label>
      {control}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

const mostrarValor = (c, v) => {
  if (c.tipo === 'si_no') return v === 'si' ? 'Sí' : 'No';
  if (c.tipo === 'opcion') return (c.opciones.find((o) => o.valor === v) || {}).etiqueta || v;
  return v;
};

// Grupos (D61): los integrantes, uno debajo del otro. Empieza con el mínimo; se agregan hasta el máximo.
function Integrantes({ evento, respuestas, setRespuestas, errores, setErrores }) {
  const { integrantes = [], ...delGrupo } = respuestas;
  const g = evento.grupo || {};
  const n = nombreGrupo(evento);
  const campos = camposDeIntegrante(evento);
  const fijar = (lista) => {
    setRespuestas((r) => ({ ...r, integrantes: lista }));
    setErrores((e) => ({ ...e, integrantes: undefined }));
  };
  const cambiar = (id, campo, valor) => {
    setRespuestas((r) => ({ ...r, integrantes: r.integrantes.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)) }));
    setErrores((e) => ({ ...e, [claveIntegrante(id, campo)]: undefined }));
  };
  const quitar = (id) => {
    const quedan = integrantes.filter((x) => x.id !== id);
    // Si se quita al responsable, pasa a serlo el primero.
    fijar(quedan.some((x) => x.responsable) || quedan.length === 0 ? quedan : quedan.map((x, k) => (k === 0 ? { ...x, responsable: true } : x)));
  };
  const responsable = (id) => fijar(integrantes.map((x) => {
    const { responsable: _, ...resto } = x;
    return x.id === id ? { ...resto, responsable: true } : resto;
  }));
  const rango = g.min === g.max ? `${g.min} personas` : `de ${g.min} a ${g.max} personas`;
  return (
    <section className="integrantes" aria-label="Integrantes">
      <h3>Integrantes <small>({integrantes.length} · cada {n.singular} es {rango})</small></h3>
      {errores.integrantes && <div className="error con-error">{errores.integrantes}</div>}
      {integrantes.map((x, k) => {
        const r = { ...respuestasDeIntegrante(delGrupo, x), categoria: x.categoria };
        return (
          <div className={`integrante ${x.responsable ? 'responsable' : ''}`} key={x.id} data-integrante={x.id}>
            <div className="integrante-titulo">
              <strong>Integrante {k + 1}</strong>
              {x.responsable
                ? <span className="marca-responsable">⭐ Responsable</span>
                : <button type="button" className="boton-chico" onClick={() => responsable(x.id)}>Hacer responsable</button>}
              {integrantes.length > 1 && <button type="button" className="boton-chico peligro" aria-label={`Quitar integrante ${k + 1}`} onClick={() => quitar(x.id)}>Quitar</button>}
            </div>
            {evento.categorias.length > 0 && (
              <div className={`campo ${errores[claveIntegrante(x.id, 'categoria')] ? 'con-error' : ''}`}>
                <span className="etiqueta">Categoría<span className="obligatorio"> *</span></span>
                <Opciones nombre={`Categoría del integrante ${k + 1}`} opciones={evento.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
                  valor={x.categoria} alElegir={(v) => cambiar(x.id, 'categoria', v)} />
                {errores[claveIntegrante(x.id, 'categoria')] && <div className="error">{errores[claveIntegrante(x.id, 'categoria')]}</div>}
              </div>
            )}
            {campos.map((campo) => (campoVisible(campo, r) ? (
              <Campo key={campo.id} campo={{ ...campo, id: `${x.id}-${campo.id}` }} valor={x[campo.id]} error={errores[claveIntegrante(x.id, campo.id)]}
                alCambiar={(v) => cambiar(x.id, campo.id, v)} />
            ) : null))}
          </div>
        );
      })}
      {(!g.max || integrantes.length < g.max)
        ? <button type="button" className="boton secundario" id="agregar-integrante" onClick={() => fijar([...integrantes, nuevoIntegrante(integrantes)])}>+ Agregar integrante</button>
        : <p className="ayuda">Ya están los {g.max} integrantes (el máximo).</p>}
    </section>
  );
}

// vistaPrevia: lo usa el asistente de eventos para probar el formulario sin guardar nada.
export default function Formulario({ evento, cargador, sesionId, alCancelar, alGuardar, vistaPrevia = false, presenciales = null }) {
  const grupo = esGrupo(evento);
  const [respuestas, setRespuestas] = useState(() => {
    if (!grupo) return {};
    const lista = [];
    for (let k = 0; k < Math.max(1, (evento.grupo && evento.grupo.min) || 1); k++) lista.push(nuevoIntegrante(lista));
    return { integrantes: lista };
  });
  const [pago, setPago] = useState({ medio: '', banco: '', ultimos6: '' });
  const [errores, setErrores] = useState({});
  const [paso, setPaso] = useState('datos'); // 'datos' | 'confirmar'
  const [guardando, setGuardando] = useState(false);
  const [falla, setFalla] = useState('');
  const [yaPresente, setYaPresente] = useState(false);
  const institucion = useInstitucion();
  // D31: el día del evento (si hay asistencia para hoy), se puede dejar a la persona presente al inscribirla.
  const instanciaHoy = useMemo(() => {
    const a = evento.asistencia;
    if (!a || a.toma === false) return null;
    const hoy = diaLocal();
    return (a.instancias || []).find((i) => i.fecha === hoy) || null;
  }, [evento]);

  const dia = diaLocal();
  const cobro = useMemo(() => calcularCobro(evento, respuestas, dia), [evento, respuestas, dia]);
  const avisos = calcularAvisos(evento, respuestas);
  const haySensibles = evento.campos.some((c) => c.sensible);
  const sinCobro = esSinCobro(evento); // D45: evento gratuito, no se pide pago

  const cambiar = (id, valor) => {
    setRespuestas((r) => ({ ...r, [id]: valor }));
    setErrores((e) => ({ ...e, [id]: undefined }));
  };
  const cambiarPago = (id, valor) => {
    setPago((p) => ({ ...p, [id]: valor }));
    setErrores((e) => ({ ...e, [id]: undefined }));
  };

  const revisar = () => {
    const e = validar(evento, respuestas, pago);
    setErrores(e);
    if (Object.keys(e).length > 0) {
      const primero = document.querySelector('.con-error');
      if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setPaso('confirmar');
    window.scrollTo(0, 0);
  };

  const guardar = async () => {
    setGuardando(true);
    setFalla('');
    try {
      const ahora = new Date();
      const inscripcion = {
        id: nuevoId(),
        eventoId: evento.id,
        cargador,
        sesionId,
        creadaEn: ahora.toISOString(),
        diaCarga: diaLocal(ahora),
        estado: 'pendiente',
        categoria: grupo ? null : respuestas.categoria || null,
        datos: limpiarRespuestas(evento, respuestas),
        conceptos: cobro.detalle,
        monto: cobro.total,
        pago: sinCobro ? { medio: SIN_COBRO } : {
          medio: pago.medio,
          ...(pago.medio === 'transferencia' ? { banco: pago.banco.trim(), ultimos6: pago.ultimos6 } : {}),
        },
        ...(instanciaHoy && yaPresente ? { presente: { id: nuevoId(), instancia: instanciaHoy.id } } : {}),
      };
      if (vistaPrevia) {
        alGuardar(`Vista previa: así termina una inscripción (total ${formatoPesos(inscripcion.monto)}). No se guardó nada.`);
        return;
      }
      await guardarInscripcion(inscripcion);
      alGuardar(sinCobro ? '✅ Inscripción guardada.' : `✅ Inscripción guardada. Cobrado: ${formatoPesos(inscripcion.monto)}.`);
    } catch (e) {
      setFalla('No se pudo guardar. No cierres la app y volvé a tocar «Guardar». Si sigue fallando, avisá a un organizador.');
      setGuardando(false);
    }
  };

  const resumenCobro = (
    <div className="cobro">
      {cobro.faltaDato ? (
        <span>El total aparece cuando completes la categoría y las preguntas del cobro.</span>
      ) : (
        <>
          {cobro.detalle.map((d) => (
            <div className="linea" key={`${d.id}|${d.tramo || ''}`}>
              <span>
                {d.nombre}{d.cantidad > 1 ? ` × ${d.cantidad}` : ''}
                {d.tramo ? <small> ({d.tramo})</small> : null}
              </span>
              <span>{d.monto === 0 ? 'Gratis' : formatoPesos(d.monto)}</span>
            </div>
          ))}
          <div className="linea total">
            <span>Total a cobrar</span>
            <span>{formatoPesos(cobro.total)}</span>
          </div>
        </>
      )}
    </div>
  );

  if (paso === 'confirmar') {
    const medio = sinCobro ? { etiqueta: 'Sin cobro (evento gratuito)' } : MEDIOS_PAGO.find((m) => m.valor === pago.medio);
    const cat = grupo ? null : evento.categorias.find((c) => c.id === respuestas.categoria);
    const visibles = (grupo ? camposDelGrupo(evento) : evento.campos).filter((c) => campoVisible(c, respuestas) && respuestas[c.id] !== undefined);
    const mostrar = (c) => mostrarValor(c, respuestas[c.id]);
    const integrantes = grupo ? respuestas.integrantes || [] : [];
    return (
      <main className="contenido">
        <h2>Revisá antes de guardar</h2>
        <dl className="revision">
          {cat && (
            <>
              <dt>Categoría</dt>
              <dd>{cat.nombre}</dd>
            </>
          )}
          {visibles.map((c) => (
            <div key={c.id}>
              <dt>{c.etiqueta}</dt>
              <dd>{mostrar(c)}</dd>
            </div>
          ))}
          {grupo && (
            <div>
              <dt>Integrantes ({integrantes.length})</dt>
              <dd>
                <ol className="lista-integrantes">
                  {integrantes.map((x) => {
                    const r = { ...respuestasDeIntegrante(respuestas, x), categoria: x.categoria };
                    const catX = evento.categorias.find((c) => c.id === x.categoria);
                    const otros = camposDeIntegrante(evento).filter((c) => c.id !== 'nombre' && campoVisible(c, r) && x[c.id] !== undefined && x[c.id] !== '');
                    return (
                      <li key={x.id}>
                        <strong>{x.nombre}</strong>{x.responsable ? ' ⭐' : ''}
                        {catX ? ` · ${catX.nombre}` : ''}
                        {otros.map((c) => ` · ${c.etiqueta}: ${mostrarValor(c, x[c.id])}`).join('')}
                      </li>
                    );
                  })}
                </ol>
              </dd>
            </div>
          )}
          <dt>Medio de pago</dt>
          <dd>
            {medio.etiqueta}
            {pago.medio === 'transferencia' && ` · ${pago.banco} · …${pago.ultimos6}`}
          </dd>
        </dl>
        {avisos.map((a) => (
          <div className="advertencia" key={a}>⚠️ {a}</div>
        ))}
        {!sinCobro && resumenCobro}
        {!sinCobro && (
          <p className="pregunta-cobro">
            {pago.medio === 'efectivo'
              ? `¿Recibiste ${formatoPesos(cobro.total)} en efectivo?`
              : `¿Verificaste el pago de ${formatoPesos(cobro.total)}?`}
          </p>
        )}
        {instanciaHoy && (
          <label className="rol-opcion ya-presente">
            <input type="checkbox" checked={yaPresente} onChange={(e) => setYaPresente(e.target.checked)} />
            <span><strong>Ya está presente</strong><small>Llegó al evento: queda marcada en «{instanciaHoy.nombre}» y no tiene que hacer la fila de la puerta.</small></span>
          </label>
        )}
        {falla && <div className="error-grande">{falla}</div>}
        <button className="boton principal grande" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Sí, guardar inscripción'}
        </button>
        <button className="boton secundario" onClick={() => setPaso('datos')} disabled={guardando}>
          Volver y corregir
        </button>
      </main>
    );
  }

  return (
    <main className="contenido con-barra">
      <h2>Nueva inscripción</h2>
      {evento.modalidad === 'hibrido' && presenciales && presenciales.cerradasEn && (
        <div className="advertencia" role="status">🏛️ Los lugares presenciales están completos: solo se puede inscribir en forma <strong>virtual</strong>.</div>
      )}
      {evento.modalidad === 'hibrido' && presenciales && !presenciales.cerradasEn && presenciales.quedan != null && presenciales.quedan <= 20 && (
        <div className="advertencia" role="status">🏛️ Quedan pocos lugares presenciales: {presenciales.quedan}.</div>
      )}
      <p className="ayuda">Inscripción {grupo ? `por ${nombreGrupo(evento).singular}` : evento.unidad === 'pareja' ? 'por pareja' : 'por persona'}. Los datos con * son obligatorios.</p>

      {!grupo && evento.categorias.length > 0 && (
        <div className={`campo ${errores.categoria ? 'con-error' : ''}`}>
          <span className="etiqueta">
            Categoría<span className="obligatorio"> *</span>
          </span>
          <Opciones
            nombre="Categoría"
            opciones={evento.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
            valor={respuestas.categoria}
            alElegir={(v) => cambiar('categoria', v)}
          />
          {errores.categoria && <div className="error">{errores.categoria}</div>}
        </div>
      )}

      {(grupo ? camposDelGrupo(evento) : evento.campos).map((campo) =>
        campoVisible(campo, respuestas) ? (
          <Campo key={campo.id} campo={campo} valor={respuestas[campo.id]} error={errores[campo.id]} alCambiar={(v) => cambiar(campo.id, v)} presencialesCerradas={!!(presenciales && presenciales.cerradasEn)} />
        ) : null
      )}

      {grupo && <Integrantes evento={evento} respuestas={respuestas} setRespuestas={setRespuestas} errores={errores} setErrores={setErrores} />}

      {haySensibles && <p className="nota-privacidad">🔒 {institucion.avisoSalud}</p>}

      {avisos.map((a) => (
        <div className="advertencia" key={a}>⚠️ {a}</div>
      ))}

      {!sinCobro && (<>
      <h3>Pago</h3>
      <div className={`campo ${errores.medio ? 'con-error' : ''}`}>
        <span className="etiqueta">
          Medio de pago<span className="obligatorio"> *</span>
        </span>
        <Opciones nombre="Medio de pago" opciones={MEDIOS_PAGO} valor={pago.medio} alElegir={(v) => cambiarPago('medio', v)} />
        {errores.medio && <div className="error">{errores.medio}</div>}
      </div>
      {pago.medio === 'transferencia' && (
        <>
          <Campo
            campo={{ id: 'banco', etiqueta: 'Banco o billetera de origen', tipo: 'texto', obligatorio: true }}
            valor={pago.banco}
            error={errores.banco}
            alCambiar={(v) => cambiarPago('banco', v)}
          />
          <Campo
            campo={{ id: 'ultimos6', etiqueta: 'Últimos 6 caracteres de la operación (letras o números)', tipo: 'texto', obligatorio: true }}
            valor={pago.ultimos6}
            error={errores.ultimos6}
            alCambiar={(v) => cambiarPago('ultimos6', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          />
        </>
      )}

      </>)}

      <div className="barra-inferior">
        {sinCobro ? <div className="cobro"><span>Evento sin cobro: no se pide pago.</span></div> : resumenCobro}
        <div className="botones-barra">
          <button className="boton secundario" onClick={alCancelar}>Cancelar</button>
          <button className="boton principal" onClick={revisar}>{sinCobro ? 'Revisar' : 'Revisar y cobrar'}</button>
        </div>
      </div>
    </main>
  );
}
