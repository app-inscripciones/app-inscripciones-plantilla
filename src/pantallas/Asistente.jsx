import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc, mensajeError, problemaDefinicion } from '../datos/panel.js';
import { diaLocal, etiquetaEvento } from '../logica/fechas.js';
import {
  PASOS, PREGUNTAS_COMUNES, esObligatoria, fijarObligatoria, TIPOS_PREGUNTA, TURNOS, SUGERENCIA_CATEGORIAS,
  nuevoBorrador, desdeEvento, cambiarUnidad, cambiarGrupo, cambiarAlcance, preguntaParaUnidad, GRUPO_INICIAL, LIMITES_GRUPO, cambiarModalidad, CIERRES_CUPO, AVISO_CUPO_PCT, tienePregunta, alternarPregunta, nuevaPregunta, idDesde,
  diasEntre, nombreDia, momentosAsistencia, revisarDefinicion, resumenSimple, armarDefinicion,
} from '../logica/asistente.js';
import Formulario from './Formulario.jsx';
import { definicionPractica } from '../logica/practica.js';
import { nombreGrupo } from '../logica/grupo.js';
import { AvisoPractica, ListaPractica, usePracticaDe } from './AvisoPractica.jsx';

// Etapa 6 · Asistente para crear eventos (R13, D15, D30): preguntas simples, de a una.

const MENSAJES = {}; // todos los mensajes están en src/datos/mensajes.js

const TITULOS = {
  nombre: 'Nombre',
  fechas: 'Fechas',
  unidad: 'Inscripción',
  modalidad: 'Modalidad',
  categorias: 'Categorías',
  datos: 'Datos',
  cobro: 'Cobro',
  asistencia: 'Asistencia',
  resumen: 'Revisar y abrir',
};

const soloNumeros = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 9);

function Tarjeta({ elegida, alElegir, icono, titulo, texto, deshabilitada, id }) {
  return (
    <button type="button" id={id} className={`tarjeta-opcion ${elegida ? 'elegida' : ''}`} aria-pressed={!!elegida} disabled={deshabilitada} onClick={alElegir}>
      {icono && <span className="icono" aria-hidden="true">{icono}</span>}
      <span><strong>{titulo}</strong>{texto && <small>{texto}</small>}</span>
    </button>
  );
}

function Avisos({ lista, titulo = '💡 Lo que suele olvidarse' }) {
  if (!lista.length) return null;
  return (
    <div className="advertencia">
      <strong>{titulo}</strong>
      <ul className="lista-avisos">{lista.map((r) => <li key={r.texto}>{r.texto}</li>)}</ul>
    </div>
  );
}

// ---------------------------------------------------------------- pasos

function PasoNombre({ b, set }) {
  return (
    <>
      <h2>¿Cómo se llama el evento?</h2>
      <p className="ayuda">Así lo van a ver los colaboradores, el panel y el Excel. Por ejemplo: «Campamento de jóvenes 2027».</p>
      <label className="campo"><span className="etiqueta">Nombre del evento</span>
        <input id="ev-nombre" value={b.nombre} maxLength={120} onChange={(e) => set({ ...b, nombre: e.target.value })} autoFocus />
      </label>
    </>
  );
}

function PasoFechas({ b, set }) {
  const varios = b.fechaFin !== '' && b.fechaFin !== undefined && b.fechaFin !== null ? true : !!b.variosDias;
  return (
    <>
      <h2>¿Cuándo es?</h2>
      <label className="campo"><span className="etiqueta">{varios ? 'Primer día' : 'Día del evento'}</span>
        <input id="ev-fecha" type="date" value={b.fecha} onChange={(e) => set({ ...b, fecha: e.target.value })} />
      </label>
      <div className="tarjetas-opcion">
        <Tarjeta elegida={!varios} icono="1️⃣" titulo="Dura un solo día" alElegir={() => set({ ...b, fechaFin: '', variosDias: false })} />
        <Tarjeta id="ev-varios" elegida={varios} icono="📆" titulo="Dura varios días" alElegir={() => set({ ...b, variosDias: true })} />
      </div>
      {varios && (
        <label className="campo"><span className="etiqueta">Último día</span>
          <input id="ev-fecha-fin" type="date" min={b.fecha} value={b.fechaFin || ''} onChange={(e) => set({ ...b, fechaFin: e.target.value })} />
        </label>
      )}
    </>
  );
}

const nombreDelGrupo = (b) => String((b.grupo && b.grupo.nombre) || GRUPO_INICIAL.nombre).trim().toLowerCase() || 'grupo';
const ng = (b) => nombreGrupo({ grupo: { ...GRUPO_INICIAL, ...(b.grupo || {}) } });

function PasoUnidad({ b, set }) {
  const g = { ...GRUPO_INICIAL, ...(b.grupo || {}) };
  const n = nombreDelGrupo(b);
  return (
    <>
      <h2>¿Cómo se inscriben?</h2>
      <p className="ayuda">Una inscripción puede ser una persona, una pareja o un grupo (por ejemplo, un equipo). El cupo del lugar y el panel cuentan <strong>personas</strong>: una pareja ocupa dos lugares y un grupo, tantos como integrantes tenga.</p>
      <div className="tarjetas-opcion">
        <Tarjeta id="ev-persona" elegida={b.unidad === 'persona'} icono="🧍" titulo="Cada persona por separado"
          texto="Cada inscripción es una persona y se le cobra a cada una." alElegir={() => set(cambiarUnidad(b, 'persona'))} />
        <Tarjeta id="ev-pareja" elegida={b.unidad === 'pareja'} icono="👫" titulo="En pareja"
          texto="Cada inscripción es una pareja (por ejemplo, matrimonios) y se cobra una vez por pareja." alElegir={() => set(cambiarUnidad(b, 'pareja'))} />
        <Tarjeta id="ev-grupo" elegida={b.unidad === 'grupo'} icono="👨‍👩‍👧‍👦" titulo="En grupo"
          texto="Cada inscripción es un grupo de varias personas: un equipo, una familia… Vos elegís cuántos integrantes." alElegir={() => set(cambiarUnidad(b, 'grupo'))} />
      </div>
      {b.unidad === 'grupo' && (
        <div className="panel-form">
          <label className="campo"><span className="etiqueta">¿Cómo se llama cada grupo?</span>
            <input id="grupo-nombre" value={g.nombre} maxLength={30} placeholder="Ej.: equipo, familia, grupo" onChange={(e) => set(cambiarGrupo(b, { nombre: e.target.value }))} />
          </label>
          <div className="opciones compacto">
            {['equipo', 'familia', 'grupo'].map((x) => (
              <button key={x} type="button" className={`opcion ${g.nombre === x ? 'elegida' : ''}`} onClick={() => set(cambiarGrupo(b, { nombre: x }))}>{x}</button>
            ))}
          </div>
          <h4>¿Cuántas personas tiene cada {n}?</h4>
          <div className="campos-grupo">
            <label className="campo"><span className="etiqueta">Mínimo</span>
              <input id="grupo-min" inputMode="numeric" value={g.min ?? ''} onChange={(e) => set(cambiarGrupo(b, { min: soloNumeros(e.target.value).slice(0, 2) === '' ? '' : Number(soloNumeros(e.target.value).slice(0, 2)) }))} />
            </label>
            <label className="campo"><span className="etiqueta">Máximo</span>
              <input id="grupo-max" inputMode="numeric" value={g.max ?? ''} onChange={(e) => set(cambiarGrupo(b, { max: soloNumeros(e.target.value).slice(0, 2) === '' ? '' : Number(soloNumeros(e.target.value).slice(0, 2)) }))} />
            </label>
          </div>
          <p className="ayuda">Si {ng(b).el === 'la' ? 'todas las' : 'todos los'} {ng(b).plural} tienen la misma cantidad, poné el mismo número en los dos (por ejemplo, 5 y 5). Entre {LIMITES_GRUPO.min} y {LIMITES_GRUPO.max} personas.</p>
          <h4>¿Cómo se cobra?</h4>
          <div className="tarjetas-opcion">
            <Tarjeta id="cobro-por-grupo" elegida={g.cobro !== 'integrante'} icono="🏷️" titulo={`Un precio por ${n}`}
              texto={`Cada ${n} paga lo mismo, sin importar cuántos sean. Por ejemplo, la inscripción de un equipo a un torneo.`} alElegir={() => set(cambiarGrupo(b, { cobro: 'grupo' }))} />
            <Tarjeta id="cobro-por-integrante" elegida={g.cobro === 'integrante'} icono="🧮" titulo="Según cada integrante"
              texto="Se suma lo de cada uno, que puede cambiar según su categoría (por ejemplo, niños más barato). Típico de familias." alElegir={() => set(cambiarGrupo(b, { cobro: 'integrante' }))} />
          </div>
          <p className="ayuda">Uno de los integrantes queda como <strong>responsable</strong>. Si después cambia un integrante, lo corrige el Organizador desde el panel.</p>
        </div>
      )}
    </>
  );
}

function PasoCategorias({ b, set, recordatorios }) {
  const cambiar = (k, campo, v) => set({ ...b, categorias: b.categorias.map((c, j) => (j === k ? { ...c, [campo]: v } : c)) });
  const agregar = () => {
    const ids = b.categorias.map((c) => c.id);
    set({ ...b, categorias: [...b.categorias, { id: idDesde(`categoria ${ids.length + 1}`, ids, 'c_'), nombre: '', edadMin: '', edadMax: '' }] });
  };
  return (
    <>
      <h2>¿Hay categorías de participantes?</h2>
      <p className="ayuda">Sirven para cobrar distinto según la categoría (por ejemplo, niños más barato) y para ver cuántos hay de cada una. Quien carga la inscripción elige la categoría de una lista.</p>
      <div className="tarjetas-opcion">
        <Tarjeta id="cat-no" elegida={!b.usaCategorias} icono="🟰" titulo="No, todos iguales" texto="Todos pagan lo mismo y se cuentan juntos." alElegir={() => set({ ...b, usaCategorias: false })} />
        <Tarjeta id="cat-si" elegida={b.usaCategorias} icono="👨‍👩‍👧" titulo="Sí, hay categorías" texto="Por ejemplo: niños, jóvenes y adultos, con precios distintos." alElegir={() => set({ ...b, usaCategorias: true })} />
      </div>
      {b.usaCategorias && (
        <div className="panel-form">
          {b.categorias.length === 0 && (
            <p>
              <button className="boton-chico" onClick={() => set({ ...b, categorias: SUGERENCIA_CATEGORIAS.map((c) => ({ ...c })) })}>
                Usar: Niños, Adolescentes, Jóvenes y Adultos
              </button>{' '}
              <span className="ayuda">(después podés cambiarlas)</span>
            </p>
          )}
          {b.categorias.map((c, k) => (
            <div className="fila-categoria" key={c.id}>
              <input aria-label="Nombre de la categoría" value={c.nombre} placeholder="Ej.: Niños" onChange={(e) => cambiar(k, 'nombre', e.target.value)} />
              <label>de <input aria-label="Edad desde" inputMode="numeric" value={c.edadMin} onChange={(e) => cambiar(k, 'edadMin', soloNumeros(e.target.value).slice(0, 3))} /></label>
              <label>a <input aria-label="Edad hasta" inputMode="numeric" value={c.edadMax} onChange={(e) => cambiar(k, 'edadMax', soloNumeros(e.target.value).slice(0, 3))} /> años</label>
              <button className="boton-chico" onClick={() => set({ ...b, categorias: b.categorias.filter((_, j) => j !== k) })}>Quitar</button>
            </div>
          ))}
          <button className="boton-chico" style={{ marginLeft: 0 }} onClick={agregar}>+ Agregar categoría</button>
          <p className="ayuda">Cambiá los nombres y las edades como quieras; las que no uses, sacalas con «Quitar». Las edades sirven para que la app avise si la edad cargada no corresponde a la categoría elegida. Los precios de cada categoría se cargan más adelante, en «Cobro».</p>
        </div>
      )}
      {b.usaCategorias && <Avisos lista={recordatorios} titulo="💡 Para revisar" />}
    </>
  );
}

// R18 · ¿Cómo se participa? Presencial, virtual o híbrido; en los híbridos, cupo presencial y cierre automático.
function PasoModalidad({ b, set, recordatorios }) {
  const m = b.modalidad || 'presencial';
  const cupo = Number(b.cupoPresencial) || 0;
  const pct = Number(b.cierrePresencialPct ?? 100);
  const textoCierre = (p) => (p === 0 ? 'No cerrar sola: solo avisar' : `Cerrar sola al ${p} %${cupo ? ` (${Math.ceil((cupo * p) / 100)} presenciales)` : ''}`);
  return (
    <>
      <h2>¿Cómo se participa?</h2>
      <div className="tarjetas-opcion">
        <Tarjeta id="mod-presencial" elegida={m === 'presencial'} icono="🏛️" titulo="Presencial"
          texto="Todos van al lugar del evento. Recomendado si no hay transmisión." alElegir={() => set(cambiarModalidad(b, 'presencial'))} />
        <Tarjeta id="mod-virtual" elegida={m === 'virtual'} icono="💻" titulo="Virtual"
          texto="Todos participan a distancia. No se toma asistencia en la puerta." alElegir={() => set(cambiarModalidad(b, 'virtual'))} />
        <Tarjeta id="mod-hibrido" elegida={m === 'hibrido'} icono="🔀" titulo="Híbrido"
          texto="Cada persona elige: presencial o virtual. El panel cuenta cuántos hay de cada uno." alElegir={() => set(cambiarModalidad(b, 'hibrido'))} />
      </div>
      {m === 'hibrido' && (
        <div className="panel-form">
          <p className="ayuda">El formulario va a preguntar <strong>«¿Cómo va a participar? Presencial / Virtual»</strong>. Si la modalidad virtual cuesta distinto, lo podés poner en el paso «Cobro» (por ejemplo, un cobro «solo si elige Presencial»).</p>
          <label className="campo">
            <span className="etiqueta">¿Cuántas personas entran en el lugar? (cupo presencial)</span>
            <input id="cupo-presencial" inputMode="numeric" value={b.cupoPresencial ?? ''} placeholder="Ej.: 500"
              onChange={(e) => set({ ...b, cupoPresencial: soloNumeros(e.target.value).slice(0, 7) })} />
            <small className="ayuda">Se cuentan personas{b.unidad === 'pareja' ? ' (cada pareja ocupa dos lugares)' : b.unidad === 'grupo' ? ` (cada ${nombreDelGrupo(b)} ocupa tantos lugares como integrantes tenga)` : ''}. Dejalo vacío si no hay límite.</small>
          </label>
          {cupo > 0 && (
            <>
              <p className="ayuda">⚠️ Al llegar al {AVISO_CUPO_PCT} % del cupo ({Math.ceil((cupo * AVISO_CUPO_PCT) / 100)} presenciales), el panel avisa. ¿Qué pasa después?</p>
              <div className="opciones" role="radiogroup" aria-label="Cierre automático de los lugares presenciales">
                {CIERRES_CUPO.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={pct === p} className={`opcion ${pct === p ? 'elegida' : ''}`}
                    onClick={() => set({ ...b, cierrePresencialPct: p })}>{textoCierre(p)}{p === 100 ? ' (recomendado)' : ''}</button>
                ))}
              </div>
              <p className="ayuda">Cuando se cierran los lugares presenciales, los celulares de los cargadores solo ofrecen «Virtual». El Organizador puede ampliar el cupo o volver a abrirlos desde «Resumen».</p>
            </>
          )}
        </div>
      )}
      <Avisos lista={recordatorios} />
    </>
  );
}

// Lista de condiciones posibles: «Solo si [pregunta] es [valor]».
// soloGrupo: en un grupo, solo preguntas que se responden una vez por grupo (para preguntas o cobros del grupo).
function condicionesPosibles(b, hastaId, conCategorias = true, soloGrupo = false) {
  const lista = [];
  if (conCategorias && b.usaCategorias && !soloGrupo) {
    for (const c of b.categorias) if (c.nombre) lista.push({ clave: `categoria=${c.id}`, cond: { campo: 'categoria', en: [c.id] }, texto: `la categoría es «${c.nombre}»` });
  }
  for (const c of b.campos) {
    if (c.id === hastaId) break;
    if (!c.etiqueta) continue;
    if (soloGrupo && c.porIntegrante) continue;
    if (c.tipo === 'si_no') {
      lista.push({ clave: `${c.id}=si`, cond: { campo: c.id, igual: 'si' }, texto: `en «${c.etiqueta}» responde «Sí»` });
      lista.push({ clave: `${c.id}=no`, cond: { campo: c.id, igual: 'no' }, texto: `en «${c.etiqueta}» responde «No»` });
    }
    if (c.tipo === 'opcion') {
      for (const o of c.opciones || []) if (o.etiqueta) lista.push({ clave: `${c.id}=${o.valor}`, cond: { campo: c.id, igual: o.valor }, texto: `en «${c.etiqueta}» elige «${o.etiqueta}»` });
    }
  }
  return lista;
}
const claveDe = (cond) => (!cond ? '' : cond.en ? `${cond.campo}=${cond.en[0]}` : `${cond.campo}=${cond.igual}`);

function SelectorCondicion({ b, valor, alCambiar, hastaId, conCategorias, textoSiempre, etiqueta, soloGrupo }) {
  const lista = condicionesPosibles(b, hastaId, conCategorias, soloGrupo);
  if (lista.length === 0) return null;
  return (
    <label className="mini-campo">{etiqueta}
      <select value={claveDe(valor)} onChange={(e) => alCambiar((lista.find((x) => x.clave === e.target.value) || {}).cond || null)}>
        <option value="">{textoSiempre}</option>
        {lista.map((x) => <option key={x.clave} value={x.clave}>Solo si {x.texto}</option>)}
      </select>
    </label>
  );
}

// En un grupo: ¿la pregunta se responde una vez por grupo o para cada integrante?
function Alcance({ b, c, set, ids }) {
  const n = nombreDelGrupo(b);
  // Las preguntas que van juntas (por ejemplo, «¿Tiene restricciones?» y «¿Cuáles?») cambian juntas: primero las que dependen.
  const elegir = (porIntegrante) => set([...(ids || [c.id])].reverse().reduce((acc, id) => cambiarAlcance(acc, id, porIntegrante), b));
  return (
    <div className="alcance-pregunta opciones compacto" role="radiogroup" aria-label={`¿A quién se le pregunta «${c.etiqueta || 'esta pregunta'}»?`}>
      <button type="button" role="radio" aria-checked={!c.porIntegrante} className={`opcion ${!c.porIntegrante ? 'elegida' : ''}`} onClick={() => elegir(false)}>Una vez por {n}</button>
      <button type="button" role="radio" aria-checked={!!c.porIntegrante} className={`opcion ${c.porIntegrante ? 'elegida' : ''}`} onClick={() => elegir(true)}>A cada integrante</button>
    </div>
  );
}

function PreguntaPropia({ b, c, cambiar, quitar, set }) {
  const ops = c.opciones || [];
  const fijarOps = (lista) => cambiar({ ...c, opciones: lista });
  return (
    <div className="pregunta-propia">
      <input aria-label="Texto de la pregunta" value={c.etiqueta} placeholder="Escribí la pregunta. Ej.: Talle de remera" onChange={(e) => cambiar({ ...c, etiqueta: e.target.value })} />
      <div className="fila-controles">
        <label className="mini-campo">Tipo de respuesta
          <select aria-label="Tipo de respuesta" value={c.tipo} onChange={(e) => cambiar({ ...c, tipo: e.target.value, ...(e.target.value === 'opcion' && ops.length === 0 ? { opciones: [{ valor: 'op1', etiqueta: '' }, { valor: 'op2', etiqueta: '' }] } : {}) })}>
            {TIPOS_PREGUNTA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="chequeo"><input type="checkbox" checked={!!c.obligatorio} onChange={(e) => cambiar({ ...c, obligatorio: e.target.checked })} /> Obligatoria</label>
        <label className="chequeo"><input type="checkbox" checked={!!c.sensible} onChange={(e) => cambiar({ ...c, sensible: e.target.checked })} /> Es dato de salud</label>
        <SelectorCondicion b={b} valor={c.visibleSi} hastaId={c.id} etiqueta="¿Cuándo se pregunta?" textoSiempre="Siempre"
          soloGrupo={b.unidad === 'grupo' && !c.porIntegrante} conCategorias={b.unidad !== 'grupo' || !!c.porIntegrante}
          alCambiar={(v) => cambiar({ ...c, visibleSi: v })} />
      </div>
      {b.unidad === 'grupo' && <Alcance b={b} c={c} set={set} />}
      {c.tipo === 'opcion' && (
        <div className="lista-opciones">
          {ops.map((o, k) => (
            <div key={o.valor} className="fila-opcion">
              <input aria-label={`Opción ${k + 1}`} value={o.etiqueta} placeholder={`Opción ${k + 1}`} onChange={(e) => fijarOps(ops.map((x, j) => (j === k ? { ...x, etiqueta: e.target.value } : x)))} />
              {ops.length > 2 && <button className="boton-chico" onClick={() => fijarOps(ops.filter((_, j) => j !== k))}>Quitar</button>}
            </div>
          ))}
          <button className="boton-chico" style={{ marginLeft: 0 }} onClick={() => fijarOps([...ops, { valor: idDesde(`op ${ops.length + 1}`, ops.map((x) => x.valor)), etiqueta: '' }])}>+ Agregar opción</button>
        </div>
      )}
      <button className="boton-chico peligro" style={{ marginLeft: 0 }} onClick={quitar}>Quitar esta pregunta</button>
    </div>
  );
}

function PasoDatos({ b, set, recordatorios }) {
  const comunes = PREGUNTAS_COMUNES.filter((p) => preguntaParaUnidad(p, b.unidad));
  const idsComunes = PREGUNTAS_COMUNES.flatMap((p) => p.campos.map((c) => c.id));
  const nombres = b.campos.filter((c) => ['nombre_grupo', 'nombre', 'hombre', 'mujer'].includes(c.id));
  const propias = b.campos.filter((c) => !['nombre_grupo', 'nombre', 'hombre', 'mujer', 'modalidad'].includes(c.id) && !idsComunes.includes(c.id));
  const cambiarCampo = (nuevo) => set({ ...b, campos: b.campos.map((c) => (c.id === nuevo.id ? nuevo : c)) });
  const quitarCampo = (id) => set({
    ...b,
    campos: b.campos.filter((c) => c.id !== id).map((c) => (c.visibleSi && c.visibleSi.campo === id ? { ...c, visibleSi: null } : c)),
    conceptos: b.conceptos.map((k) => (k.aplicaSi && k.aplicaSi.campo === id ? { ...k, aplicaSi: null } : k)),
  });
  return (
    <>
      <h2>¿Qué datos se piden?</h2>
      <p className="ayuda">Tocá los datos que querés pedir. El formulario se arma solo. Después de abrir el evento no se puede cambiar, así que conviene pensarlo bien.</p>
      <div className="panel-form">
        <h4>Siempre se pide</h4>
        {nombres.map((c) => (
          <label className="campo" key={c.id}><span className="etiqueta">Texto de la pregunta{b.unidad === 'grupo' ? (c.porIntegrante ? ' (a cada integrante)' : ` (una vez por ${nombreDelGrupo(b)})`) : ''}</span>
            <input aria-label={`Texto de ${c.id}`} value={c.etiqueta} onChange={(e) => cambiarCampo({ ...c, etiqueta: e.target.value })} />
          </label>
        ))}
        {b.modalidad === 'hibrido' && <p className="ayuda">Y, porque el evento es híbrido: <strong>«¿Cómo va a participar?»</strong> (Presencial / Virtual).</p>}
      </div>
      <h4>Datos frecuentes</h4>
      <div className="tarjetas-opcion">
        {comunes.map((p) => {
          const activa = tienePregunta(b, p);
          return (
            <div key={p.id} className={`tarjeta-opcion ${activa ? 'elegida' : ''}`}>
              <label className="chequeo-grande">
                <input type="checkbox" checked={activa} onChange={() => set(alternarPregunta(b, p))} aria-label={p.titulo} />
                <span><strong>{p.titulo}</strong><small>{p.ayuda}</small></span>
              </label>
              {activa && (
                <label className="chequeo obligatoria-comun">
                  <input type="checkbox" checked={esObligatoria(b, p)} onChange={(e) => set(fijarObligatoria(b, p, e.target.checked))} aria-label={`${p.titulo}: obligatoria`} />
                  {' '}Obligatoria
                </label>
              )}
              {activa && !esObligatoria(b, p) && (
                <p className="nota-opcional">Opcional: quien carga puede dejarla en blanco.</p>
              )}
              {activa && b.unidad === 'grupo' && <Alcance b={b} c={b.campos.find((c) => c.id === p.campos[0].id)} ids={p.campos.map((c) => c.id)} set={set} />}
              {activa && p.editable && (
                <input aria-label={`Texto de ${p.titulo}`} value={b.campos.find((c) => c.id === p.campos[0].id).etiqueta}
                  onChange={(e) => cambiarCampo({ ...b.campos.find((c) => c.id === p.campos[0].id), etiqueta: e.target.value })} />
              )}
            </div>
          );
        })}
      </div>
      <h4>Otras preguntas</h4>
      {propias.map((c) => <PreguntaPropia key={c.id} b={b} c={c} set={set} cambiar={cambiarCampo} quitar={() => quitarCampo(c.id)} />)}
      <button className="boton secundario" onClick={() => set({ ...b, campos: [...b.campos, nuevaPregunta(b)] })}>+ Agregar otra pregunta</button>
      <Avisos lista={recordatorios} />
    </>
  );
}

function PrecioInput({ valor, alCambiar, etiqueta }) {
  return (
    <label className="precio">
      <span>{etiqueta}</span>
      <span className="con-signo">$<input aria-label={`Precio ${etiqueta}`} inputMode="numeric" value={valor ?? ''} placeholder="0" onChange={(e) => alCambiar(soloNumeros(e.target.value))} /></span>
    </label>
  );
}

function Concepto({ b, k, cambiar, quitar, puedeQuitar }) {
  const anticipado = k.precios.length === 2;
  const cobroPorGrupo = b.unidad === 'grupo' && (b.grupo || {}).cobro !== 'integrante';
  const conCategorias = b.usaCategorias && b.categorias.length > 0 && !cobroPorGrupo;
  const porCat = conCategorias && !!k.precios[0].porCategoria;
  const fijarTramo = (n, t) => cambiar({ ...k, precios: k.precios.map((x, j) => (j === n ? t : x)) });
  const alternarAnticipado = (si) => cambiar({ ...k, precios: si ? [{ ...k.precios[0], hasta: '' }, { ...k.precios[0] }] : [k.precios[k.precios.length - 1]] });
  const alternarPorCat = (si) => cambiar({ ...k, precios: k.precios.map((t) => (si ? { ...t, porCategoria: t.porCategoria || {} } : { hasta: t.hasta, monto: t.monto })) });
  return (
    <div className="panel-form concepto">
      <label className="campo"><span className="etiqueta">¿Qué se cobra?</span>
        <input aria-label="Nombre del concepto" value={k.nombre} placeholder="Ej.: Matrícula, Transporte, Remera" onChange={(e) => cambiar({ ...k, nombre: e.target.value })} />
      </label>
      <SelectorCondicion b={b} valor={k.aplicaSi} conCategorias={false} etiqueta="¿A quién se le cobra?" textoSiempre={cobroPorGrupo ? `${ng(b).el === 'la' ? 'A todas las' : 'A todos los'} ${ng(b).plural}` : 'A todos'}
        soloGrupo={cobroPorGrupo} alCambiar={(v) => cambiar({ ...k, aplicaSi: v })} />
      {conCategorias && (
        <div className="opciones compacto">
          <button type="button" className={`opcion ${!porCat ? 'elegida' : ''}`} onClick={() => alternarPorCat(false)}>Mismo precio para todos</button>
          <button type="button" className={`opcion ${porCat ? 'elegida' : ''}`} onClick={() => alternarPorCat(true)}>Precio según la categoría</button>
        </div>
      )}
      <div className="opciones compacto">
        <button type="button" className={`opcion ${!anticipado ? 'elegida' : ''}`} onClick={() => alternarAnticipado(false)}>Un solo precio</button>
        <button type="button" className={`opcion ${anticipado ? 'elegida' : ''}`} onClick={() => alternarAnticipado(true)}>Precio anticipado (más barato hasta una fecha)</button>
      </div>
      {k.precios.map((t, n) => {
        const esAnt = anticipado && n === 0;
        return (
          <div key={n} className="tramo">
            {anticipado && (
              <div className="tramo-titulo">
                {esAnt ? (
                  <label>Precio anticipado, hasta el día <input type="date" aria-label="Precio anticipado hasta" value={t.hasta || ''} max={b.fecha || undefined} onChange={(e) => fijarTramo(n, { ...t, hasta: e.target.value })} /> inclusive</label>
                ) : <span>Precio normal (después de esa fecha)</span>}
              </div>
            )}
            <div className="grilla-precios">
              {porCat
                ? b.categorias.map((c) => (
                    <PrecioInput key={c.id} etiqueta={c.nombre || 'Categoría'} valor={(t.porCategoria || {})[c.id]}
                      alCambiar={(v) => fijarTramo(n, { ...t, porCategoria: { ...(t.porCategoria || {}), [c.id]: v } })} />
                  ))
                : <PrecioInput etiqueta="Precio" valor={t.monto} alCambiar={(v) => fijarTramo(n, { ...t, monto: v })} />}
            </div>
          </div>
        );
      })}
      {porCat && <p className="ayuda">Si una categoría no paga este concepto, dejá su precio vacío. Si es gratis para esa categoría, poné 0.</p>}
      {puedeQuitar && <button className="boton-chico peligro" style={{ marginLeft: 0 }} onClick={quitar}>Quitar este cobro</button>}
    </div>
  );
}

function PasoCobro({ b, set, recordatorios }) {
  const cambiar = (nuevo) => set({ ...b, conceptos: b.conceptos.map((k) => (k.id === nuevo.id ? nuevo : k)) });
  const agregar = () => {
    const ids = b.conceptos.map((k) => k.id);
    set({ ...b, conceptos: [...b.conceptos, { id: idDesde(`cobro ${ids.length + 1}`, ids), nombre: '', aplicaSi: null, precios: [{ monto: '' }] }] });
  };
  return (
    <>
      <h2>¿Qué se cobra?</h2>
      <div className="tarjetas-opcion">
        <Tarjeta id="cobro-si" elegida={!b.sinCobro} icono="💵" titulo="Se cobra" texto="Matrícula, transporte u otros conceptos." alElegir={() => set({ ...b, sinCobro: false })} />
        <Tarjeta id="cobro-no" elegida={!!b.sinCobro} icono="🎁" titulo="Es gratis" texto="No se cobra nada: el formulario no pide pago." alElegir={() => set({ ...b, sinCobro: true })} />
      </div>
      {!b.sinCobro && (<>
      <p className="ayuda">Cada inscripción registra un solo pago con el total. Si algo se cobra solo a algunos (por ejemplo, el transporte), primero agregá la pregunta en el paso «Datos».</p>
      {b.unidad === 'grupo' && ((b.grupo || {}).cobro === 'integrante'
        ? <p className="ayuda">👨‍👩‍👧‍👦 Cada precio es <strong>por integrante</strong>: el total de {ng(b).un} {nombreDelGrupo(b)} es la suma de lo de cada uno.</p>
        : <p className="ayuda">🏷️ Cada precio es <strong>por {nombreDelGrupo(b)}</strong>, sin importar cuántos integrantes tenga. (Para cobrar según cada integrante, cambialo en el paso «Inscripción».)</p>)}
      {b.conceptos.map((k) => (
        <Concepto key={k.id} b={b} k={k} cambiar={cambiar} puedeQuitar={b.conceptos.length > 1}
          quitar={() => set({ ...b, conceptos: b.conceptos.filter((x) => x.id !== k.id) })} />
      ))}
      <button className="boton secundario" onClick={agregar}>+ Agregar otro cobro (por ejemplo, transporte)</button>
      </>)}
      <Avisos lista={recordatorios} titulo="💡 Para revisar" />
    </>
  );
}

function PasoAsistencia({ b, set }) {
  const a = b.asistencia;
  const fijar = (cambios) => set({ ...b, asistencia: { ...a, ...cambios } });
  const dias = diasEntre(b.fecha, b.fechaFin);
  const variosDias = dias.length > 1;
  const modo = a.toma === false ? 'no' : a.modo || 'llegada';
  const elegir = (m) => fijar({ modo: m, toma: m !== 'no' });
  const momentos = momentosAsistencia(b);
  const textos = b.campos.filter((c) => c.tipo === 'texto' && !['nombre', 'hombre', 'mujer', 'nombre_grupo'].includes(c.id) && !c.sensible && !c.porIntegrante);
  const alternarTurno = (t) => fijar({ turnos: (a.turnos || []).includes(t) ? a.turnos.filter((x) => x !== t) : [...(a.turnos || []), t] });
  const elegidos = a.elegidos || [];
  const alternarElegido = (k) => fijar({ elegidos: elegidos.includes(k) ? elegidos.filter((x) => x !== k) : [...elegidos, k] });
  if (b.modalidad === 'virtual') {
    return (
      <>
        <h2>¿Cómo se va a tomar asistencia?</h2>
        <div className="advertencia">💻 El evento es <strong>virtual</strong>: no se toma asistencia en la puerta. Si cambiás a «Presencial» o «Híbrido» en el paso «Modalidad», vas a poder elegir cómo se toma.</div>
      </>
    );
  }
  return (
    <>
      <h2>¿Cómo se va a tomar asistencia?</h2>
      <p className="ayuda">En la puerta, alguien marca con el celular a cada persona que llega. Elegí cuándo se marca. Cada momento se cuenta por separado en el panel.</p>
      <div className="tarjetas-opcion una-columna">
        <Tarjeta id="as-llegada" elegida={modo === 'llegada'} icono="🚪" titulo="Solo al llegar (el primer día)" texto="Lo más simple. Recomendado." alElegir={() => elegir('llegada')} />
        <Tarjeta id="as-dias" elegida={modo === 'dias'} icono="📅" titulo="Una vez por día" deshabilitada={!variosDias}
          texto={variosDias ? `Se marca ${dias.length} veces: una por cada día.` : 'Solo para eventos de varios días.'} alElegir={() => elegir('dias')} />
        <Tarjeta id="as-turnos" elegida={modo === 'turnos'} icono="🕘" titulo="Por turnos (mañana, tarde, noche)" texto="Todos los días, en los turnos que elijas." alElegir={() => elegir('turnos')} />
        <Tarjeta id="as-manual" elegida={modo === 'manual'} icono="✍️" titulo="Elegir días y turnos a mano" texto="Para marcar solo en algunos momentos." alElegir={() => elegir('manual')} />
        <Tarjeta id="as-no" elegida={modo === 'no'} icono="🚫" titulo="No se toma asistencia" alElegir={() => elegir('no')} />
      </div>
      {modo === 'turnos' && (
        <div className="panel-form">
          <h4>¿En qué turnos?</h4>
          <div className="opciones compacto">
            {TURNOS.map((t) => (
              <button key={t.id} type="button" className={`opcion ${(a.turnos || []).includes(t.id) ? 'elegida' : ''}`} aria-pressed={(a.turnos || []).includes(t.id)} onClick={() => alternarTurno(t.id)}>{t.nombre}</button>
            ))}
          </div>
        </div>
      )}
      {modo === 'manual' && (
        <div className="panel-form">
          <h4>Tocá los momentos en que se marca</h4>
          <table className="grilla-momentos">
            <thead><tr><th>Día</th><th>Todo el día</th>{TURNOS.map((t) => <th key={t.id}>{t.nombre}</th>)}</tr></thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d}>
                  <th>{nombreDia(d)}</th>
                  {['', ...TURNOS.map((t) => t.id)].map((t) => {
                    const k = `${d}|${t}`;
                    return <td key={k}><input type="checkbox" aria-label={`${nombreDia(d)} ${t || 'todo el día'}`} checked={elegidos.includes(k)} onChange={() => alternarElegido(k)} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {dias.length === 0 && <p className="ayuda">Primero elegí la fecha del evento.</p>}
        </div>
      )}
      {b.unidad === 'grupo' && modo !== 'no' && (
        <>
          <h3>En la puerta, ¿a quién se marca?</h3>
          <div className="tarjetas-opcion">
            <Tarjeta id="as-pareja" elegida={a.modoPareja !== 'individual'} icono="👨‍👩‍👧‍👦" titulo={`${ng(b).el === 'la' ? 'A la' : 'Al'} ${ng(b).singular} ${ng(b).junto}`} texto="Un toque marca a todos. Recomendado si llegan juntos." alElegir={() => fijar({ modoPareja: 'pareja' })} />
            <Tarjeta id="as-individual" elegida={a.modoPareja === 'individual'} icono="🧍🧍🧍" titulo="A cada integrante por separado" texto="Sirve si pueden llegar en distintos momentos o hay que saber quién vino." alElegir={() => fijar({ modoPareja: 'individual' })} />
          </div>
        </>
      )}
      {b.unidad === 'pareja' && modo !== 'no' && (
        <>
          <h3>En la puerta, ¿a quién se marca?</h3>
          <div className="tarjetas-opcion">
            <Tarjeta id="as-pareja" elegida={a.modoPareja !== 'individual'} icono="👫" titulo="A la pareja junta" texto="Un toque marca a los dos. Recomendado." alElegir={() => fijar({ modoPareja: 'pareja' })} />
            <Tarjeta id="as-individual" elegida={a.modoPareja === 'individual'} icono="🧍🧍" titulo="A cada persona por separado" texto="Sirve si pueden llegar en distintos momentos." alElegir={() => fijar({ modoPareja: 'individual' })} />
          </div>
        </>
      )}
      {modo !== 'no' && (
        <>
          <h3>¿Los participantes pueden marcar su propio presente con un QR?</h3>
          <div className="tarjetas-opcion">
            <Tarjeta id="auto-no" elegida={!a.autopresente} icono="🚪" titulo="No, solo en la puerta" texto="Lo marca la persona que controla en la puerta. Recomendado." alElegir={() => fijar({ autopresente: false })} />
            <Tarjeta id="auto-si" elegida={!!a.autopresente} icono="📱" titulo="Sí, también con un QR"
              texto="Se pone un QR en la entrada: cada uno lo escanea con su celular, escribe su DNI o teléfono y queda presente. La puerta sigue funcionando." alElegir={() => fijar({ autopresente: true })} />
          </div>
          {a.autopresente && <p className="ayuda">El QR se crea el día del evento, en «QR de colaboradores»: impreso como cartel, o en una pantalla donde cambia cada 30 segundos (para que nadie se marque con una foto). Hace falta que el participante tenga internet en su celular.</p>}
        </>
      )}
      {modo !== 'no' && textos.length > 0 && (
        <label className="mini-campo">En la puerta, además del nombre, mostrar:
          <select aria-label="Dato para reconocer" value={armarDefinicion(b).asistencia.campoProcedencia || ''} onChange={(e) => fijar({ campoProcedencia: e.target.value })}>
            <option value="">Nada más</option>
            {textos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
        </label>
      )}
      {modo !== 'no' && (
        <div className="exito momentos-resultado">
          {momentos.length === 0 ? 'Todavía no elegiste ningún momento.' : <>Se va a marcar en: {momentos.map((m) => m.nombre).join(' · ')}</>}
        </div>
      )}
      <p className="ayuda">Si después necesitás agregar un momento (por ejemplo, una reunión extra), se puede hacer con el evento abierto.</p>
      <VistaPuerta b={b} def={armarDefinicion(b)} />
    </>
  );
}

// Vista previa de la pantalla de la puerta (D30): un ejemplo con datos inventados, que se puede tocar.
// Ejemplo de la vista previa de la puerta: un grupo con la cantidad mínima de integrantes elegida (hasta 6 a la vista).
const NOMBRES_EJEMPLO = [['Ana', 'Pérez'], ['Juan', 'Gómez'], ['Lola', 'Sosa'], ['Tomás', 'Ruiz'], ['Sofía', 'Díaz'], ['Pedro', 'Luna']];
function ejemploGrupo(g) {
  const n = Math.max(2, Math.min(Number(g.min) || 3, 50));
  const vis = NOMBRES_EJEMPLO.slice(0, Math.min(n, NOMBRES_EJEMPLO.length));
  const titulo = (g.nombre || 'grupo')[0].toUpperCase() + (g.nombre || 'grupo').slice(1);
  const dato = vis.map(([nom, ap], k) => `${nom} ${ap}${k === 0 ? ' ⭐' : ''}`).join(' · ') + (n > vis.length ? ` y ${n - vis.length} más` : '');
  return { id: 1, nombre: `${titulo} «Los Pumas» (${n})`, personas: vis.map(([nom]) => nom), dato };
}

function VistaPuerta({ b, def }) {
  const [marcados, setMarcados] = useState([]);
  const a = def.asistencia;
  if (!a.toma || a.instancias.length === 0) return null;
  const pareja = def.unidad === 'pareja';
  const enGrupo = def.unidad === 'grupo';
  const porPersona = (pareja || enGrupo) && a.modoPareja === 'individual';
  const procedencia = a.campoProcedencia ? ' · Central' : '';
  const cat = def.categorias.length ? ` · ${def.categorias[def.categorias.length - 1].nombre}` : '';
  const ejemplos = enGrupo
    ? [ejemploGrupo(def.grupo)]
    : pareja
    ? [{ id: 1, nombre: 'Juan Pérez y Ana Gómez', personas: ['Juan', 'Ana'], dato: 'Tel. 3624 111222' }]
    : [{ id: 1, nombre: 'Ana Pérez', dato: b.campos.some((c) => c.id === 'dni') ? 'DNI 30.111.222' : 'Tel. 3624 111222' },
       { id: 2, nombre: 'Ana María Sosa', dato: b.campos.some((c) => c.id === 'dni') ? 'DNI 28.333.444' : 'Tel. 3624 333444' }];
  const botones = porPersona ? (e) => e.personas : () => ['Presente'];
  const tocar = (k) => setMarcados((m) => (m.includes(k) ? m : [...m, k]));
  return (
    <div className="vista-puerta">
      <h4>Así se va a ver en la puerta (ejemplo)</h4>
      <div className="marco-celular bajo">
        <div className="pantalla-celular">
          <main className="contenido puerta">
            <div className="instancia-actual"><span>Tomando: <strong>{a.instancias[0].nombre}</strong></span>{a.instancias.length > 1 && <span className="enlace">Cambiar</span>}</div>
            <div className="contador-puerta"><span>Presentes</span><strong>{marcados.length} <small>de 120</small></strong></div>
            <input className="buscador-puerta" value="ana" readOnly aria-label="Ejemplo de búsqueda" />
            <ul className="lista-puerta">
              {ejemplos.map((e) => (
                <li key={e.id} className={`fila-puerta ${botones(e).every((p) => marcados.includes(`${e.id}${p}`)) ? 'presente' : ''}`}>
                  <div className="quien"><div className="nombre">{e.nombre}</div><div className="mas">{e.dato}{cat}{procedencia}</div></div>
                  <div className="botones-puerta">
                    {botones(e).map((p) => (marcados.includes(`${e.id}${p}`)
                      ? <div key={p} className="estado-puerta verde">✓ {p}<small>09:15 · vos</small></div>
                      : <button key={p} type="button" className="boton-presente" onClick={() => tocar(`${e.id}${p}`)}>✓ {p}</button>))}
                  </div>
                </li>
              ))}
            </ul>
          </main>
        </div>
      </div>
      <p className="ayuda">Quien controla escribe unas letras del nombre{b.campos.some((c) => c.id === 'dni') ? ' o del DNI' : ''} y toca «Presente». Probá tocar el botón.</p>
    </div>
  );
}

function PasoResumen({ revision, irA, alAbrir, abriendo }) {
  const [confirmar, setConfirmar] = useState(false);
  const [vista, setVista] = useState(0);
  const [mensajeVista, setMensajeVista] = useState('');
  const def = revision.definicion;
  const evento = useMemo(() => ({ ...def, id: 'vista-previa' }), [def]);
  const sinErrores = revision.errores.length === 0;
  return (
    <>
      <h2>Revisá antes de abrir</h2>
      {!def.practica && <AvisoPractica accion="abrir un evento real" />}
      {!sinErrores && (
        <div className="error-grande" role="alert">
          Falta completar algunas cosas:
          <ul className="lista-avisos">
            {revision.errores.map((e) => (
              <li key={e.texto}>{e.texto} <button className="boton-chico" onClick={() => irA(e.paso)}>Ir a {TITULOS[e.paso]}</button></li>
            ))}
          </ul>
        </div>
      )}
      {sinErrores && (
        <>
          <ol className="resumen-simple">{resumenSimple(def).map((l) => <li key={l}>{l}</li>)}</ol>
          <Avisos lista={revision.recordatorios} titulo="💡 Para revisar (no impide abrir)" />
          <h3>Así se ve el formulario en el celular</h3>
          <p className="ayuda">Probalo: podés completarlo y tocar los botones. No se guarda nada.</p>
          <div className="marco-celular">
            <div className="pantalla-celular">
              {mensajeVista ? (
                <div className="contenido">
                  <div className="exito">{mensajeVista}</div>
                  <button className="boton secundario" onClick={() => { setMensajeVista(''); setVista((v) => v + 1); }}>Probar de nuevo</button>
                </div>
              ) : (
                <Formulario key={vista} evento={evento} cargador="Vista previa" vistaPrevia
                  alCancelar={() => setVista((v) => v + 1)} alGuardar={(m) => setMensajeVista(m)} />
              )}
            </div>
          </div>
          {!confirmar ? (
            <button id="abrir-evento" className="boton principal grande" onClick={() => setConfirmar(true)}>Abrir el evento</button>
          ) : (
            <div className="advertencia confirmar-abrir">
              <p><strong>¿Abrir el evento?</strong> Desde ese momento se pueden generar los QR y cargar inscripciones. <strong>El formulario, las categorías y los precios ya no se van a poder cambiar.</strong></p>
              <div className="botones-barra">
                <button className="boton secundario" onClick={() => setConfirmar(false)} disabled={abriendo}>Todavía no</button>
                <button id="confirmar-abrir" className="boton principal" onClick={alAbrir} disabled={abriendo}>{abriendo ? 'Abriendo…' : 'Sí, abrir el evento'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- asistente

export function Asistente({ inicial, idInicial, alSalir, alAbierto, otros = [] }) {
  const [b, setB] = useState(() => ({ ...nuevoBorrador(), ...inicial }));
  const [id, setId] = useState(idInicial || null);
  const [paso, setPaso] = useState(() => Math.max(0, PASOS.indexOf((inicial && inicial.paso) || 'nombre')));
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [guardado, setGuardado] = useState(''); // '' | 'guardando' | 'ok' | 'error'
  const [error, setError] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const hoy = diaLocal();
  const revision = useMemo(() => revisarDefinicion(b, hoy, otros), [b, hoy, otros]);
  const nombrePaso = PASOS[paso];
  const erroresPaso = revision.errores.filter((e) => e.paso === nombrePaso);
  const recordatoriosPaso = revision.recordatorios.filter((e) => e.paso === nombrePaso);
  const set = (nuevo) => { setB(nuevo); setGuardado(''); };

  const guardar = useCallback(async (pasoActual) => {
    setGuardado('guardando');
    const r = await rpc('panel_guardar_borrador', { p_id: id, p_borrador: { ...b, paso: pasoActual } });
    if (r && r.ok) { setId(r.id); setGuardado('ok'); return true; }
    setGuardado('error');
    if (r && r.error === 'evento_ya_abierto') setError(mensajeError(r));
    return false;
  }, [b, id]);

  useEffect(() => { window.scrollTo(0, 0); }, [paso]);

  // Mientras se guarda el paso, los botones quedan bloqueados: un segundo toque no se pierde ni salta pasos.
  const [avanzando, setAvanzando] = useState(false);
  const ir = async (nuevo) => {
    if (avanzando) return;
    setMostrarErrores(false);
    setAvanzando(true);
    try { await guardar(PASOS[nuevo]); setPaso(nuevo); } finally { setAvanzando(false); }
  };
  const siguiente = async () => {
    if (erroresPaso.length > 0) { setMostrarErrores(true); return; }
    await ir(paso + 1);
  };

  const abrir = async () => {
    setAbriendo(true); setError('');
    await guardar('resumen');
    const r = await rpc('panel_abrir_evento', { p_id: id, p_definicion: revision.definicion });
    setAbriendo(false);
    if (r && r.ok) { alAbierto(r.id); return; }
    // Etapa 9: si la base no deja abrirlo, decir qué falta y en qué paso se arregla.
    const problema = r && r.error === 'definicion_invalida' ? problemaDefinicion(r.detalle) : null;
    if (problema) {
      const n = PASOS.indexOf(problema.paso);
      setError(`No se pudo abrir: ${problema.texto}. Volvé al paso ${n + 1} «${TITULOS[problema.paso]}» y revisalo.`);
      return;
    }
    setError(mensajeError(r, MENSAJES));
  };

  const pasoProps = { b, set, recordatorios: recordatoriosPaso };
  return (
    <div className="asistente">
      <ol className="pasos-asistente" aria-label="Pasos">
        {PASOS.map((p, k) => (
          <li key={p} className={k === paso ? 'actual' : k < paso ? 'hecho' : ''}>
            <button onClick={() => ir(k)} disabled={k > paso && revision.errores.some((e) => PASOS.indexOf(e.paso) < k)} aria-current={k === paso ? 'step' : undefined}>
              <span className="numero-paso">{k + 1}</span><span className="nombre-paso">{TITULOS[p]}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="contenido-paso">
        {nombrePaso === 'nombre' && <PasoNombre {...pasoProps} />}
        {nombrePaso === 'fechas' && <PasoFechas {...pasoProps} />}
        {nombrePaso === 'unidad' && <PasoUnidad {...pasoProps} />}
        {nombrePaso === 'modalidad' && <PasoModalidad {...pasoProps} />}
        {nombrePaso === 'categorias' && <PasoCategorias {...pasoProps} />}
        {nombrePaso === 'datos' && <PasoDatos {...pasoProps} />}
        {nombrePaso === 'cobro' && <PasoCobro {...pasoProps} />}
        {nombrePaso === 'asistencia' && <PasoAsistencia {...pasoProps} />}
        {nombrePaso === 'resumen' && <PasoResumen revision={revision} irA={(p) => ir(PASOS.indexOf(p))} alAbrir={abrir} abriendo={abriendo} />}

        {mostrarErrores && erroresPaso.length > 0 && (
          <div className="error-grande" role="alert">{erroresPaso.map((e) => <div key={e.texto}>{e.texto}</div>)}</div>
        )}
        {error && <div className="error-grande" role="alert">{error}</div>}
      </div>
      <div className="barra-asistente">
        <span className={`estado-guardado ${guardado}`}>
          {guardado === 'guardando' && 'Guardando…'}
          {guardado === 'ok' && '✓ Borrador guardado'}
          {guardado === 'error' && '⚠️ No se pudo guardar (¿hay internet?). No cierres esta pantalla.'}
        </span>
        <div className="botones-fila">
          <button className="boton secundario" onClick={async () => { await guardar(nombrePaso); alSalir(); }}>Guardar y seguir después</button>
          {paso > 0 && <button className="boton secundario" disabled={avanzando} onClick={() => ir(paso - 1)}>← Atrás</button>}
          {nombrePaso !== 'resumen' && <button id="siguiente" className="boton principal" disabled={avanzando} onClick={siguiente}>Siguiente →</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sección «Crear eventos» del panel

export default function Eventos({ alAbierto }) {
  const [datos, setDatos] = useState(null);
  const [editando, setEditando] = useState(null); // { id, inicial }
  const [copiarDe, setCopiarDe] = useState('');
  const [error, setError] = useState('');
  const [borrando, setBorrando] = useState(null);
  const [creandoPractica, setCreandoPractica] = useState(false);
  const [pendiente, setPendiente] = useState(null);
  const practicaOrg = usePracticaDe('organizador');

  const cargar = useCallback(async () => {
    const r = await rpc('panel_borradores');
    if (r && r.ok) setDatos(r); else setError(mensajeError(r, MENSAJES));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (editando) {
    return (
      <Asistente key={editando.id || 'nuevo'} inicial={editando.inicial} idInicial={editando.id}
        otros={datos.copiables.filter((e) => !e.archivadoEn && !e.esModelo)}
        alSalir={() => { setEditando(null); cargar(); }} alAbierto={alAbierto} />
    );
  }
  if (!datos) return error ? <div className="error-grande">{error}</div> : <p>Cargando…</p>;

  const borrar = async (id) => {
    const r = await rpc('panel_borrar_borrador', { p_id: id });
    setBorrando(null);
    if (!r || !r.ok) setError(mensajeError(r, MENSAJES));
    cargar();
  };
  const origen = datos.copiables.find((e) => e.id === copiarDe);
  const crearPractica = async () => {
    setCreandoPractica(true);
    setError('');
    const r = await rpc('panel_crear_practica', { p_definicion: definicionPractica(diaLocal()) });
    setCreandoPractica(false);
    if (r && r.ok) alAbierto(r.id); else setError(mensajeError(r, MENSAJES));
  };
  const practicas = datos.practicas || [];
  // D66: antes de crear un evento real, si falta la práctica, un aviso con «Practicar ahora» o «Seguir igual».
  const conAviso = (accion) => { if (practicaOrg.hecha) accion(); else setPendiente(() => accion); };
  if (pendiente) {
    return (
      <section>
        <h2>Antes de crear el evento</h2>
        <AvisoPractica accion="crear un evento real" alSeguir={() => { const f = pendiente; setPendiente(null); f(); }} alCancelar={() => setPendiente(null)} />
      </section>
    );
  }

  return (
    <section>
      <h2>Crear un evento</h2>
      <p className="ayuda">El asistente te hace preguntas simples, de a una. Podés dejarlo a mitad de camino y seguir después: queda guardado como borrador hasta que lo abras.</p>
      <div className="tarjetas-opcion">
        <div className="tarjeta-opcion">
          <span className="icono" aria-hidden="true">✨</span>
          <span><strong>Empezar de cero</strong><small>Un evento nuevo, con preguntas desde el principio.</small>
            <button id="crear-evento" className="boton principal" onClick={() => conAviso(() => setEditando({ id: null, inicial: nuevoBorrador() }))}>Crear evento nuevo</button>
          </span>
        </div>
        <div className="tarjeta-opcion">
          <span className="icono" aria-hidden="true">📋</span>
          <span><strong>Copiar otro evento</strong><small>Usa el mismo formulario, categorías y cobros. Después cambiás lo que haga falta.</small>
            <select id="copiar-de" aria-label="Evento para copiar" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
              <option value="">Elegí un evento…</option>
              {datos.copiables.map((e) => <option key={e.id} value={e.id}>{e.esModelo ? e.nombre : etiquetaEvento(e)}{e.archivadoEn ? ' (archivado)' : ''}</option>)}
            </select>
            <button className="boton secundario" disabled={!origen} onClick={() => conAviso(() => setEditando({ id: null, inicial: { ...desdeEvento(origen.definicion), paso: 'nombre' } }))}>Copiar</button>
          </span>
        </div>
        <div className="tarjeta-opcion">
          <span className="icono" aria-hidden="true">🧪</span>
          <span><strong>Evento de práctica</strong><small>Para capacitar a los voluntarios sin tocar datos reales. Se crea y se abre en un toque, funciona igual que uno real (QR, carga sin internet, puerta) y se borra solo al terminar la semana.</small>
            {!practicaOrg.hecha && (<><small><strong>Tu práctica de Organizador:</strong></small><ListaPractica rol="organizador" pasos={practicaOrg.pasos} /></>)}
            <button id="crear-practica" className={`boton ${practicaOrg.hecha ? 'secundario' : 'principal'}`} disabled={creandoPractica} onClick={crearPractica}>{creandoPractica ? 'Creando…' : 'Crear evento de práctica'}</button>
          </span>
        </div>
      </div>
      {error && <div className="error-grande">{error}</div>}
      {practicas.length > 0 && (
        <>
          <h3>Prácticas en curso</h3>
          <ul className="lista-borradores">
            {practicas.map((e) => (
              <li key={e.id} className="borrador">
                <div><strong>🧪 {e.nombre}</strong><small>Se puede usar hasta el {nombreDia(e.hasta)}. Después se borra sola.</small></div>
                <div className="acciones"><button className="boton-chico" onClick={() => alAbierto(e.id)}>Usar esta</button></div>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Borradores</h3>
      {datos.borradores.length === 0 ? <p className="ayuda">No hay borradores.</p> : (
        <ul className="lista-borradores">
          {datos.borradores.map((e) => (
            <li key={e.id} className="borrador">
              <div>
                <strong>{e.nombre}</strong>
                <small>{e.borrador && e.borrador.fecha ? nombreDia(e.borrador.fecha) : 'Sin fecha'} · último cambio {new Date(e.actualizadoEn).toLocaleDateString('es-AR')} · {e.creadoPor}</small>
              </div>
              <div className="acciones">
                <button className="boton-chico" onClick={() => setEditando({ id: e.id, inicial: e.borrador })}>Continuar</button>
                {borrando === e.id ? (
                  <>
                    <button className="boton-chico peligro" onClick={() => borrar(e.id)}>Sí, borrar</button>
                    <button className="boton-chico" onClick={() => setBorrando(null)}>No</button>
                  </>
                ) : <button className="boton-chico peligro" onClick={() => setBorrando(e.id)}>Borrar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
