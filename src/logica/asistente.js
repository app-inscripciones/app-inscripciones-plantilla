// Etapa 6 · Asistente para crear eventos (R13, D15, D30).
// El asistente edita un «borrador»: es la misma definición que usa el resto de la app
// (campos, categorías, conceptos, asistencia) más algunos datos de ayuda (fechaFin, asistencia.modo…).
// `armarDefinicion` deja todo listo y coherente; `revisarDefinicion` dice qué falta.

// Nombres fijos que usa el resto del sistema (búsqueda de duplicados, puerta, panel, Excel).
export const IDS_FIJOS = ['categoria', 'nombre', 'hombre', 'mujer', 'dni', 'telefono', 'modalidad', 'nombre_grupo', 'integrantes', 'id', 'responsable'];

import { nombreGrupo } from './grupo.js';
import { nombreNormal, diaComoTexto } from './textos.js';

// Grupos (R19, D61): cómo se llama el grupo, cuántos integrantes y cómo se cobra.
export const GRUPO_INICIAL = { nombre: 'equipo', min: 5, max: 6, cobro: 'grupo' };
export const LIMITES_GRUPO = { min: 2, max: 50 };
const etiquetaNombreGrupo = (nombre) => { const n = nombreGrupo({ grupo: { nombre } }); return `Nombre ${n.del} ${n.singular}`; };

// Modalidad (R18, D57): presencial, virtual o híbrido. En los híbridos el formulario pregunta cómo participa.
export const MODALIDADES = ['presencial', 'virtual', 'hibrido'];
export const CIERRES_CUPO = [100, 95, 90, 0]; // 0 = no cerrar solo
export const AVISO_CUPO_PCT = 90;
export const CAMPO_MODALIDAD = {
  id: 'modalidad', etiqueta: '¿Cómo va a participar?', tipo: 'opcion', obligatorio: true,
  opciones: [{ valor: 'presencial', etiqueta: 'Presencial' }, { valor: 'virtual', etiqueta: 'Virtual' }],
};

export const TURNOS = [
  { id: 'mañana', nombre: 'Mañana' },
  { id: 'tarde', nombre: 'Tarde' },
  { id: 'noche', nombre: 'Noche' },
];

// Preguntas que se suelen pedir: se activan con un toque.
export const PREGUNTAS_COMUNES = [
  { id: 'dni', titulo: 'DNI', ayuda: 'Sirve para encontrar a la persona en la puerta y detectar inscripciones repetidas.', solo: ['persona', 'grupo'], enGrupo: 'integrante',
    campos: [{ id: 'dni', etiqueta: 'DNI', tipo: 'dni', obligatorio: true }] },
  { id: 'telefono', titulo: 'Teléfono de contacto', ayuda: 'Para avisar cambios o comunicarse antes del evento.',
    campos: [{ id: 'telefono', etiqueta: 'Teléfono de contacto', tipo: 'telefono', obligatorio: true }] },
  { id: 'edad', titulo: 'Edad', ayuda: 'Si hay categorías por edad, la app avisa cuando no coincide.', solo: ['persona', 'grupo'], enGrupo: 'integrante',
    campos: [{ id: 'edad', etiqueta: 'Edad', tipo: 'numero', obligatorio: true, min: 0, max: 120 }] },
  { id: 'procedencia', titulo: 'Lugar o institución de origen', ayuda: 'Por ejemplo: «Iglesia de origen», «Colegio», «Club». Podés cambiar el texto.', editable: true,
    campos: [{ id: 'procedencia', etiqueta: 'Institución de origen', tipo: 'texto', obligatorio: true }] },
  { id: 'transporte', titulo: 'Si viaja en el transporte del evento', ayuda: 'Pregunta de Sí / No. Se puede cobrar aparte (paso «¿Qué se cobra?»).',
    campos: [{ id: 'transporte', etiqueta: '¿Viaja en el transporte del evento?', tipo: 'si_no', obligatorio: true }] },
  { id: 'restricciones', titulo: 'Restricciones alimentarias', ayuda: 'Pregunta Sí / No y, si contesta «Sí», cuáles. Es un dato de salud (se protege).', enGrupo: 'integrante',
    campos: [
      { id: 'restricciones', etiqueta: '¿Tiene restricciones alimentarias?', tipo: 'si_no', obligatorio: true, sensible: true },
      { id: 'restricciones_cuales', etiqueta: '¿Cuáles?', tipo: 'texto', obligatorio: true, sensible: true, visibleSi: { campo: 'restricciones', igual: 'si' } },
    ] },
  { id: 'emergencia', titulo: 'Teléfono de emergencia', ayuda: 'De un familiar o conocido que no vaya al evento.',
    campos: [{ id: 'emergencia', etiqueta: 'Teléfono de un contacto de emergencia', tipo: 'telefono', obligatorio: true }] },
  { id: 'correo', titulo: 'Correo electrónico', ayuda: 'Opcional para quien se inscribe.',
    campos: [{ id: 'correo', etiqueta: 'Correo electrónico', tipo: 'texto', obligatorio: false }] },
];

export const TIPOS_PREGUNTA = [
  { id: 'texto', nombre: 'Texto libre' },
  { id: 'si_no', nombre: 'Sí / No' },
  { id: 'opcion', nombre: 'Elegir una opción de una lista' },
  { id: 'numero', nombre: 'Número' },
  { id: 'telefono', nombre: 'Teléfono' },
];

export const SUGERENCIA_CATEGORIAS = [
  { id: 'ninos', nombre: 'Niños', edadMin: 0, edadMax: 12 },
  { id: 'adolescentes', nombre: 'Adolescentes', edadMin: 13, edadMax: 17 },
  { id: 'jovenes', nombre: 'Jóvenes', edadMin: 18, edadMax: 30 },
  { id: 'adultos', nombre: 'Adultos', edadMin: 31, edadMax: 120 },
];

// ¿La pregunta común se ofrece para esta forma de inscribirse?
export const preguntaParaUnidad = (p, unidad) => !p.solo || (Array.isArray(p.solo) ? p.solo.includes(unidad) : p.solo === unidad);
const idsPorIntegrante = PREGUNTAS_COMUNES.filter((p) => p.enGrupo === 'integrante').flatMap((p) => p.campos.map((c) => c.id));

const camposNombre = (unidad, previos = [], grupo = GRUPO_INICIAL) => {
  const etiqueta = (id, def) => (previos.find((c) => c.id === id) || {}).etiqueta || def;
  if (unidad === 'grupo') {
    return [
      { id: 'nombre_grupo', etiqueta: etiqueta('nombre_grupo', etiquetaNombreGrupo(grupo.nombre)), tipo: 'texto', obligatorio: true },
      { id: 'nombre', etiqueta: etiqueta('nombre', 'Nombre y apellido'), tipo: 'texto', obligatorio: true, porIntegrante: true },
    ];
  }
  return unidad === 'pareja'
    ? [
        { id: 'hombre', etiqueta: etiqueta('hombre', 'Nombre y apellido de él'), tipo: 'texto', obligatorio: true },
        { id: 'mujer', etiqueta: etiqueta('mujer', 'Nombre y apellido de ella'), tipo: 'texto', obligatorio: true },
      ]
    : [{ id: 'nombre', etiqueta: etiqueta('nombre', 'Nombre y apellido'), tipo: 'texto', obligatorio: true }];
};

export function nuevoBorrador() {
  return {
    nombre: '',
    fecha: '',
    fechaFin: '',
    unidad: 'persona',
    grupo: { ...GRUPO_INICIAL },
    modalidad: 'presencial',
    cupoPresencial: '',
    cierrePresencialPct: 100,
    usaCategorias: false,
    sinCobro: false,
    categorias: [],
    campos: [...camposNombre('persona'), ...PREGUNTAS_COMUNES[0].campos, ...PREGUNTAS_COMUNES[1].campos],
    conceptos: [{ id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ monto: null }] }],
    asistencia: { toma: true, modo: 'llegada', modoPareja: null, turnos: ['mañana'], elegidos: [], instancias: [], camposBusqueda: [], campoProcedencia: null },
  };
}

// Copiar la configuración de otro evento (por ejemplo, el del año pasado). Nombre y fechas se piden de nuevo.
export function desdeEvento(def) {
  const copia = JSON.parse(JSON.stringify(def));
  const a = copia.asistencia || {};
  let modo = a.modo;
  if (!modo) {
    if (a.toma === false) modo = 'no';
    else if ((a.instancias || []).length <= 1) modo = 'llegada';
    else if (a.instancias.every((i) => i.turno)) modo = 'turnos';
    else modo = 'dias';
  }
  const turnos = a.turnos || [...new Set((a.instancias || []).map((i) => i.turno).filter(Boolean))];
  // Los precios anticipados quedan con la fecha de corte vacía: hay que volver a elegirla.
  const sinCobro = (copia.conceptos || []).length === 0;
  const conceptos = (sinCobro ? nuevoBorrador().conceptos : copia.conceptos).map((c) => ({ ...c, precios: c.precios.map((t, k) => (k < c.precios.length - 1 ? { ...t, hasta: '' } : t)) }));
  return {
    ...nuevoBorrador(),
    unidad: ['pareja', 'grupo'].includes(copia.unidad) ? copia.unidad : 'persona',
    grupo: copia.grupo ? { ...GRUPO_INICIAL, ...copia.grupo } : { ...GRUPO_INICIAL },
    modalidad: MODALIDADES.includes(copia.modalidad) ? copia.modalidad : 'presencial',
    cupoPresencial: copia.cupoPresencial ?? '',
    cierrePresencialPct: copia.cierrePresencialPct === undefined ? 100 : copia.cierrePresencialPct ?? 0,
    usaCategorias: (copia.categorias || []).length > 0,
    sinCobro,
    categorias: copia.categorias || [],
    campos: copia.campos || [],
    conceptos,
    asistencia: { ...nuevoBorrador().asistencia, ...a, modo, turnos: turnos.length ? turnos : ['mañana'], elegidos: [], instancias: [] },
    nombre: '',
    fecha: '',
    fechaFin: '',
  };
}

export function cambiarUnidad(b, unidad) {
  if (b.unidad === unidad) return b;
  const grupo = { ...GRUPO_INICIAL, ...(b.grupo || {}) };
  const sinNombres = b.campos.filter((c) => !['nombre', 'hombre', 'mujer', 'nombre_grupo'].includes(c.id));
  const comunesSolo = PREGUNTAS_COMUNES.filter((p) => !preguntaParaUnidad(p, unidad)).flatMap((p) => p.campos.map((c) => c.id));
  // En los grupos, algunas preguntas comunes se piden a cada integrante (DNI, edad, restricciones); fuera de un grupo, nada es «por integrante».
  const ajustar = (c) => {
    const { porIntegrante, ...resto } = c;
    if (unidad !== 'grupo') return resto;
    return idsPorIntegrante.includes(c.id) ? { ...resto, porIntegrante: true } : resto;
  };
  return {
    ...b,
    unidad,
    grupo,
    campos: [...camposNombre(unidad, b.campos, grupo), ...sinNombres.filter((c) => !comunesSolo.includes(c.id)).map(ajustar)],
    asistencia: { ...b.asistencia, modoPareja: unidad === 'pareja' || unidad === 'grupo' ? b.asistencia.modoPareja || 'pareja' : null },
  };
}

// Cambios en los datos del grupo: nombre («equipo», «familia»), mínimo, máximo y forma de cobro.
// Si el texto de la pregunta del nombre del grupo era el automático, se actualiza con el nombre nuevo.
export function cambiarGrupo(b, cambios) {
  const antes = { ...GRUPO_INICIAL, ...(b.grupo || {}) };
  const grupo = { ...antes, ...cambios };
  const campos = b.campos.map((c) => (c.id === 'nombre_grupo' && c.etiqueta === etiquetaNombreGrupo(antes.nombre)
    ? { ...c, etiqueta: etiquetaNombreGrupo(grupo.nombre) } : c));
  // Con «un precio por grupo», el precio no depende de los integrantes: sin precios por categoría ni condiciones sobre sus respuestas.
  const deIntegrante = new Set(b.campos.filter((c) => c.porIntegrante).map((c) => c.id));
  const conceptos = grupo.cobro === 'grupo'
    ? b.conceptos.map((k) => ({
        ...k,
        aplicaSi: k.aplicaSi && deIntegrante.has(k.aplicaSi.campo) ? null : k.aplicaSi,
        precios: k.precios.map((t) => (t.porCategoria ? { ...(t.hasta !== undefined ? { hasta: t.hasta } : {}), monto: t.monto ?? '' } : t)),
      }))
    : b.conceptos;
  return { ...b, grupo, campos, conceptos };
}

export function cambiarModalidad(b, modalidad) {
  if (b.modalidad === modalidad) return b;
  const sinPregunta = b.campos.filter((c) => c.id !== 'modalidad');
  let campos = sinPregunta;
  if (modalidad === 'hibrido') {
    // La pregunta va después de los nombres.
    const k = sinPregunta.filter((c) => ['nombre', 'hombre', 'mujer'].includes(c.id)).length;
    campos = [...sinPregunta.slice(0, k), { ...CAMPO_MODALIDAD, opciones: CAMPO_MODALIDAD.opciones.map((o) => ({ ...o })) }, ...sinPregunta.slice(k)];
  }
  const conceptos = b.conceptos.map((k) => (k.aplicaSi && k.aplicaSi.campo === 'modalidad' && modalidad !== 'hibrido' ? { ...k, aplicaSi: null } : k));
  let asistencia = b.asistencia;
  if (modalidad === 'virtual') asistencia = { ...asistencia, toma: false, modo: 'no' };
  else if (b.modalidad === 'virtual') asistencia = { ...asistencia, toma: true, modo: 'llegada' };
  return { ...b, modalidad, campos, conceptos, asistencia };
}

export const tienePregunta = (b, p) => p.campos.every((c) => b.campos.some((x) => x.id === c.id));

export function alternarPregunta(b, p) {
  if (tienePregunta(b, p)) {
    const ids = p.campos.map((c) => c.id);
    return {
      ...b,
      campos: b.campos.filter((c) => !ids.includes(c.id)),
      conceptos: b.conceptos.map((k) => (k.aplicaSi && ids.includes(k.aplicaSi.campo) ? { ...k, aplicaSi: null } : k)),
    };
  }
  const porIntegrante = b.unidad === 'grupo' && p.enGrupo === 'integrante';
  return { ...b, campos: [...b.campos, ...p.campos.map((c) => ({ ...c, ...(porIntegrante ? { porIntegrante: true } : {}) }))] };
}

// D68: cada pregunta frecuente se puede dejar opcional. Las que van juntas («¿Tiene restricciones?» y «¿Cuáles?») cambian juntas.
export const esObligatoria = (b, p) => p.campos.every((c) => (b.campos.find((x) => x.id === c.id) || {}).obligatorio);
export function fijarObligatoria(b, p, obligatorio) {
  const ids = p.campos.map((c) => c.id);
  return { ...b, campos: b.campos.map((c) => (ids.includes(c.id) ? { ...c, obligatorio: !!obligatorio } : c)) };
}

export function idDesde(texto, usados, prefijo = '') {
  const base = (prefijo + String(texto || ''))
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'dato';
  const inicio = /^[a-z]/.test(base) ? base : `d_${base}`;
  let id = inicio;
  let n = 2;
  while (usados.includes(id) || IDS_FIJOS.includes(id)) id = `${inicio}_${n++}`;
  return id;
}

export function nuevaPregunta(b) {
  const id = idDesde(`pregunta ${b.campos.length + 1}`, b.campos.map((c) => c.id), 'p_');
  return { id, etiqueta: '', tipo: 'texto', obligatorio: true };
}

// En un grupo: ¿la pregunta se responde una vez por grupo o para cada integrante?
// Si pasa a ser «del grupo», las preguntas de integrante que dependían de ella siguen funcionando (ven las del grupo);
// si pasa a ser «de cada integrante», las del grupo que dependían de ella pierden la condición, y también los cobros por grupo.
export function cambiarAlcance(b, id, porIntegrante) {
  const campos = b.campos.map((c) => {
    if (c.id === id) {
      const { porIntegrante: _, ...resto } = c;
      return porIntegrante ? { ...resto, porIntegrante: true } : resto;
    }
    if (porIntegrante && !c.porIntegrante && c.visibleSi && c.visibleSi.campo === id) return { ...c, visibleSi: null };
    return c;
  });
  const cobroGrupo = (b.grupo || {}).cobro !== 'integrante';
  const conceptos = porIntegrante && cobroGrupo
    ? b.conceptos.map((k) => (k.aplicaSi && k.aplicaSi.campo === id ? { ...k, aplicaSi: null } : k))
    : b.conceptos;
  return { ...b, campos, conceptos };
}

// Días entre dos fechas AAAA-MM-DD (inclusive).
export function diasEntre(desde, hasta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) return [];
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(hasta || '') && hasta >= desde ? hasta : desde;
  const dias = [];
  const d = new Date(`${desde}T12:00:00Z`);
  while (dias.length < 31) {
    const s = d.toISOString().slice(0, 10);
    if (s > fin) break;
    dias.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

const SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function nombreDia(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const t = `${SEMANA[d.getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return t[0].toUpperCase() + t.slice(1);
}

const turnoNombre = (t) => (TURNOS.find((x) => x.id === t) || {}).nombre || '';

// Los momentos en que se toma asistencia, según lo que se eligió (D30).
export function momentosAsistencia(b) {
  const a = b.asistencia || {};
  if (a.toma === false || a.modo === 'no') return [];
  const dias = diasEntre(b.fecha, b.fechaFin);
  if (dias.length === 0) return [];
  const uno = (fecha, turno) => ({
    id: turno ? `${fecha}-${turno}` : `dia-${fecha}`,
    nombre: turno ? `${nombreDia(fecha)} – ${turnoNombre(turno).toLowerCase()}` : nombreDia(fecha),
    fecha,
    ...(turno ? { turno } : {}),
  });
  if (a.modo === 'dias') return dias.map((d) => uno(d));
  if (a.modo === 'turnos') {
    const turnos = TURNOS.map((t) => t.id).filter((t) => (a.turnos || []).includes(t));
    return dias.flatMap((d) => turnos.map((t) => uno(d, t)));
  }
  if (a.modo === 'manual') {
    const orden = ['', 'mañana', 'tarde', 'noche'];
    return (a.elegidos || [])
      .map((k) => k.split('|'))
      .filter(([f]) => dias.includes(f))
      .sort((x, y) => x[0].localeCompare(y[0]) || orden.indexOf(x[1]) - orden.indexOf(y[1]))
      .map(([f, t]) => uno(f, t || null));
  }
  return [{ id: 'llegada', nombre: 'Llegada', fecha: b.fecha }];
}

// Deja la definición coherente: nombres de la puerta, momentos de asistencia, precios como números.
export function armarDefinicion(b) {
  const conPregunta = b.modalidad === 'hibrido';
  const camposB = conPregunta
    ? (b.campos.some((c) => c.id === 'modalidad') ? b.campos : cambiarModalidad({ ...b, modalidad: 'presencial' }, 'hibrido').campos)
    : b.campos.filter((c) => c.id !== 'modalidad');
  const ids = camposB.map((c) => c.id);
  const categorias = b.usaCategorias ? b.categorias : [];
  const campos = camposB.map((c) => {
    const x = { id: c.id, etiqueta: String(c.etiqueta || '').trim(), tipo: c.tipo, obligatorio: !!c.obligatorio };
    if (c.sensible) x.sensible = true;
    if (b.unidad === 'grupo' && c.porIntegrante) x.porIntegrante = true;
    if (c.tipo === 'numero') { x.min = c.min ?? 0; x.max = c.max ?? 1000000; }
    if (c.tipo === 'opcion') x.opciones = (c.opciones || []).map((o) => ({ valor: o.valor, etiqueta: String(o.etiqueta || '').trim() }));
    // En un grupo, una pregunta del grupo no puede depender de la categoría ni de una pregunta de cada integrante.
    const deIntegrante = (id) => b.unidad === 'grupo' && (id === 'categoria' || camposB.some((y) => y.id === id && y.porIntegrante));
    const condOk = c.visibleSi && ((c.visibleSi.campo === 'categoria' && categorias.length > 0) || ids.includes(c.visibleSi.campo))
      && !(b.unidad === 'grupo' && !c.porIntegrante && deIntegrante(c.visibleSi.campo));
    if (condOk) x.visibleSi = c.visibleSi;
    return x;
  });
  const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const esGrupoB = b.unidad === 'grupo';
  const g = { ...GRUPO_INICIAL, ...(b.grupo || {}) };
  const cobroPorGrupo = g.cobro !== 'integrante';
  const idsDelGrupo = campos.filter((c) => !c.porIntegrante).map((c) => c.id);
  const condicionValida = (cond) => cond && ids.includes(cond.campo) && !(esGrupoB && cobroPorGrupo && !idsDelGrupo.includes(cond.campo));
  const conceptos = b.sinCobro ? [] : b.conceptos.map((k) => ({
    id: k.id,
    nombre: String(k.nombre || '').trim(),
    aplicaSi: condicionValida(k.aplicaSi) ? k.aplicaSi : null,
    precios: k.precios.map((t, n) => {
      const ultimo = n === k.precios.length - 1;
      const tramo = {};
      if (!ultimo) tramo.hasta = t.hasta || '';
      if (k.precios.length > 1) tramo.nombreTramo = ultimo ? 'Precio normal' : 'Precio anticipado';
      if (t.porCategoria && categorias.length > 0 && !(esGrupoB && cobroPorGrupo)) {
        tramo.porCategoria = {};
        for (const cat of categorias) {
          const m = numero(t.porCategoria[cat.id]);
          if (m !== null) tramo.porCategoria[cat.id] = m;
        }
      } else tramo.monto = numero(t.monto);
      return tramo;
    }),
  }));
  const a = b.asistencia || {};
  const modalidad = MODALIDADES.includes(b.modalidad) ? b.modalidad : 'presencial';
  const toma = modalidad !== 'virtual' && a.toma !== false && a.modo !== 'no';
  const cupo = numero(b.cupoPresencial);
  const pct = Number(b.cierrePresencialPct);
  const busqueda = ['nombre', 'hombre', 'mujer', 'nombre_grupo', 'dni', 'telefono'].filter((id) => ids.includes(id));
  // campoProcedencia: '' = el organizador eligió «Nada más»; vacío/null = por defecto (el lugar de origen, si se pide).
  const procedencia = a.campoProcedencia === '' ? null
    : a.campoProcedencia && ids.includes(a.campoProcedencia) ? a.campoProcedencia
      : ids.includes('procedencia') ? 'procedencia' : null;
  return {
    nombre: String(b.nombre || '').trim(),
    fecha: b.fecha,
    ...(b.fechaFin && b.fechaFin > b.fecha ? { fechaFin: b.fechaFin } : {}),
    unidad: b.unidad,
    ...(esGrupoB ? { grupo: { nombre: String(g.nombre || '').trim().toLowerCase(), min: numero(g.min), max: numero(g.max), cobro: cobroPorGrupo ? 'grupo' : 'integrante' } } : {}),
    modalidad,
    ...(modalidad === 'hibrido' ? { cupoPresencial: cupo, cierrePresencialPct: [90, 95, 100].includes(pct) ? pct : null } : {}),
    ...(b.sinCobro ? { sinCobro: true } : {}),
    categorias: categorias.map((c) => ({ id: c.id, nombre: String(c.nombre || '').trim(), edadMin: numero(c.edadMin) ?? 0, edadMax: numero(c.edadMax) ?? 120 })),
    campos,
    conceptos,
    asistencia: {
      toma,
      modo: toma ? a.modo || 'llegada' : 'no',
      modoPareja: b.unidad === 'pareja' || esGrupoB ? (a.modoPareja === 'individual' ? 'individual' : 'pareja') : null,
      turnos: a.turnos || ['mañana'],
      elegidos: a.elegidos || [],
      instancias: toma ? momentosAsistencia(b) : [],
      // D62: los participantes pueden marcar su propio presente con un QR (además de la puerta).
      autopresente: toma && a.autopresente === true,
      camposBusqueda: busqueda,
      campoProcedencia: procedencia,
    },
  };
}

const PASOS = ['nombre', 'fechas', 'unidad', 'modalidad', 'categorias', 'datos', 'cobro', 'asistencia', 'resumen'];
export { PASOS };

// Revisa el borrador. errores: impiden abrir el evento. recordatorios: lo que suele olvidarse (no impiden).
export function revisarDefinicion(b, hoy, otros = []) {
  const errores = [];
  const recordatorios = [];
  const e = (paso, texto) => errores.push({ paso, texto });
  const r = (paso, texto) => recordatorios.push({ paso, texto });
  const def = armarDefinicion(b);

  if (def.nombre.length < 3) e('nombre', 'Escribí el nombre del evento.');
  // D63: no puede haber dos eventos a la vista con el mismo nombre (sin contar mayúsculas, acentos ni espacios).
  const igual = def.nombre.length >= 3 && (otros || []).find((o) => nombreNormal(o.nombre) === nombreNormal(def.nombre));
  if (igual) e('nombre', `Ya hay un evento llamado «${igual.nombre}»${igual.fecha ? ` (${diaComoTexto(igual.fecha)})` : ''}. Usá otro nombre: por ejemplo, agregale el año, el lugar o el grupo («${def.nombre} 2027», «${def.nombre} – Resistencia»).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(def.fecha || '')) e('fechas', 'Elegí la fecha del evento.');
  else if (hoy && def.fecha < hoy) e('fechas', 'La fecha del evento ya pasó.');
  if (b.fechaFin && b.fecha && b.fechaFin < b.fecha) e('fechas', 'El último día no puede ser antes del primero.');
  if (b.fechaFin && diasEntre(b.fecha, b.fechaFin).length > 30) e('fechas', 'El evento no puede durar más de 30 días.');

  if (def.unidad === 'grupo') {
    const g = def.grupo;
    if (!g.nombre || g.nombre.length < 2 || g.nombre.length > 30) e('unidad', 'Escribí cómo se llama cada grupo (por ejemplo, «equipo» o «familia»).');
    const okN = (n) => Number.isInteger(n) && n >= LIMITES_GRUPO.min && n <= LIMITES_GRUPO.max;
    if (!okN(g.min) || !okN(g.max)) e('unidad', `La cantidad de integrantes tiene que ser un número entero entre ${LIMITES_GRUPO.min} y ${LIMITES_GRUPO.max}.`);
    else if (g.min > g.max) e('unidad', 'El mínimo de integrantes no puede ser mayor que el máximo.');
  }

  const nombresCat = new Set();
  for (const c of def.categorias) {
    if (c.nombre.length < 2) e('categorias', 'Hay una categoría sin nombre.');
    else if (nombresCat.has(c.nombre.toLowerCase())) e('categorias', `La categoría «${c.nombre}» está repetida.`);
    nombresCat.add(c.nombre.toLowerCase());
    if (!(Number.isInteger(c.edadMin) && Number.isInteger(c.edadMax) && c.edadMin >= 0 && c.edadMax <= 120 && c.edadMin <= c.edadMax)) {
      e('categorias', `Revisá las edades de «${c.nombre || 'la categoría'}».`);
    }
  }
  if (b.usaCategorias && def.categorias.length < 2) e('categorias', 'Si hay categorías, tienen que ser al menos dos.');
  // Edades que se superponen (¿en qué categoría va alguien de 60 si hay «31 a 60» y «60 a 120»?) o que quedan sin categoría.
  const porEdad = def.categorias.filter((c) => Number.isInteger(c.edadMin) && Number.isInteger(c.edadMax) && c.edadMin <= c.edadMax)
    .sort((x, y) => x.edadMin - y.edadMin);
  for (let k = 1; k < porEdad.length; k++) {
    const a = porEdad[k - 1];
    const c = porEdad[k];
    if (c.edadMin <= a.edadMax) {
      const desde = c.edadMin;
      const hasta = Math.min(a.edadMax, c.edadMax);
      const edades = desde === hasta ? `${desde} años` : `${desde} a ${hasta} años`;
      e('categorias', `«${a.nombre}» (${a.edadMin} a ${a.edadMax}) y «${c.nombre}» (${c.edadMin} a ${c.edadMax}) se superponen: ¿en cuál va alguien de ${edades}? Corregí las edades.`);
    } else if (c.edadMin > a.edadMax + 1) {
      const desde = a.edadMax + 1;
      const hasta = c.edadMin - 1;
      r('categorias', `Nadie de ${desde === hasta ? `${desde} años` : `${desde} a ${hasta} años`} tiene categoría (entre «${a.nombre}» y «${c.nombre}»).`);
    }
  }

  const etiquetas = new Set();
  for (const c of def.campos) {
    if (c.etiqueta.length < 2) { e('datos', 'Hay una pregunta sin texto.'); continue; }
    if (etiquetas.has(c.etiqueta.toLowerCase())) e('datos', `La pregunta «${c.etiqueta}» está repetida.`);
    etiquetas.add(c.etiqueta.toLowerCase());
    if (c.tipo === 'opcion') {
      const ops = c.opciones.filter((o) => o.etiqueta.length > 0);
      if (ops.length < 2 || ops.length !== c.opciones.length) e('datos', `«${c.etiqueta}»: escribí al menos dos opciones (sin dejar ninguna vacía).`);
    }
  }
  const ids = def.campos.map((c) => c.id);
  if (!ids.includes('telefono')) r('datos', 'No pedís teléfono: no vas a poder avisar cambios a los inscriptos.');
  if (!ids.includes('restricciones') && (def.fechaFin || def.campos.length > 0)) r('datos', '¿Va a haber comida? Quizás convenga preguntar por restricciones alimentarias.');
  if (def.unidad === 'persona' && !ids.includes('dni')) r('datos', 'Sin DNI, la app solo puede detectar inscripciones repetidas por el teléfono.');
  if (def.unidad === 'grupo' && !def.campos.some((c) => c.id === 'dni' && c.porIntegrante)) r('datos', 'Sin el DNI de cada integrante, la app solo puede detectar inscripciones repetidas por el teléfono, y en la puerta se busca por nombre.');
  const dniOpcional = def.campos.find((c) => c.id === 'dni' && !c.obligatorio);
  if (dniOpcional) r('datos', 'El DNI es opcional: a quien no lo dé, en la puerta solo se lo busca por nombre, y es más difícil detectar inscripciones repetidas.');
  if (def.categorias.length > 0 && def.unidad !== 'pareja' && !ids.includes('edad')) r('datos', 'Hay categorías por edad pero no se pide la edad: la app no va a poder avisar si la categoría elegida no corresponde.');

  if (def.modalidad === 'hibrido') {
    const cupo = b.cupoPresencial;
    if (cupo !== '' && cupo !== null && cupo !== undefined && !(Number.isInteger(Number(cupo)) && Number(cupo) >= 1 && Number(cupo) <= 1000000)) {
      e('modalidad', 'El cupo presencial tiene que ser un número entero (por ejemplo, 500), o quedar vacío si no hay límite.');
    }
    if (def.cupoPresencial === null) r('modalidad', 'No pusiste el cupo presencial: el panel va a contar cuántos hay en cada modalidad, pero no va a avisar si se llena el lugar.');
    else if (def.cierrePresencialPct === null) r('modalidad', `Al llenarse el lugar, los presenciales no se van a cerrar solos: el panel avisa al ${AVISO_CUPO_PCT} % y el Organizador decide.`);
  }

  if (def.conceptos.length === 0 && !def.sinCobro) e('cobro', 'Tiene que haber al menos un concepto de cobro (por ejemplo, la matrícula).');
  const montoOk = (m) => Number.isInteger(m) && m >= 0 && m <= 100000000;
  let todoCero = true;
  for (const k of def.conceptos) {
    const nombre = k.nombre || 'el concepto';
    if (k.nombre.length < 2) e('cobro', 'Hay un concepto de cobro sin nombre.');
    k.precios.forEach((t, n) => {
      if (n < k.precios.length - 1) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t.hasta || '')) e('cobro', `«${nombre}»: elegí hasta qué día rige el precio anticipado.`);
        else if (def.fecha && t.hasta > def.fecha) r('cobro', `«${nombre}»: el precio anticipado termina después de la fecha del evento.`);
        else if (hoy && t.hasta < hoy) r('cobro', `«${nombre}»: la fecha del precio anticipado ya pasó; se va a cobrar el precio normal.`);
      }
      if (t.porCategoria) {
        const sin = def.categorias.filter((c) => t.porCategoria[c.id] === undefined);
        for (const c of def.categorias) if (t.porCategoria[c.id] !== undefined && !montoOk(t.porCategoria[c.id])) e('cobro', `«${nombre}»: revisá el precio de ${c.nombre} (número entero, sin puntos ni signos).`);
        if (sin.length === def.categorias.length) e('cobro', `«${nombre}»: escribí el precio de al menos una categoría.`);
        else if (sin.length > 0 && n === k.precios.length - 1) r('cobro', `«${nombre}» no tiene precio para ${sin.map((c) => c.nombre).join(', ')}: a esa categoría no se le cobra este concepto.`);
        if (Object.values(t.porCategoria).some((m) => m > 0)) todoCero = false;
      } else {
        if (!montoOk(t.monto)) e('cobro', `«${nombre}»: escribí el precio (número entero, sin puntos ni signos).`);
        if (t.monto > 0) todoCero = false;
      }
    });
    if (k.precios.length === 2) {
      const [ant, nor] = k.precios;
      const caro = ant.porCategoria
        ? def.categorias.some((c) => ant.porCategoria[c.id] > (nor.porCategoria || {})[c.id])
        : ant.monto > nor.monto;
      if (caro) r('cobro', `«${nombre}»: el precio anticipado es más caro que el normal.`);
    }
  }
  if (def.conceptos.length > 0 && todoCero) r('cobro', 'Todos los precios están en 0: no se va a cobrar nada.');

  if (def.asistencia.toma) {
    if (def.asistencia.instancias.length === 0) e('asistencia', 'Elegí al menos un momento para tomar asistencia.');
    if (def.asistencia.instancias.length > 30) e('asistencia', 'Son demasiados momentos de asistencia (máximo 30).');
  }
  return { errores, recordatorios, definicion: def };
}

const pesos = (m) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(m);
const fechaLarga = (d) => (d ? `${nombreDia(d).toLowerCase()}/${d.slice(0, 4)}` : '');

// El resumen en palabras simples que se muestra antes de abrir el evento.
export function resumenSimple(def) {
  const lineas = [];
  lineas.push(def.fechaFin ? `«${def.nombre}» va del ${fechaLarga(def.fecha)} al ${fechaLarga(def.fechaFin)}.` : `«${def.nombre}» es el ${fechaLarga(def.fecha)}.`);
  if (def.modalidad === 'virtual') lineas.push('Es un evento virtual: todos participan a distancia.');
  if (def.modalidad === 'hibrido') {
    const cierre = def.cierrePresencialPct ? `; al llegar al ${def.cierrePresencialPct} % se cierran solos los lugares presenciales` : '; los lugares presenciales no se cierran solos';
    lineas.push(`Es híbrido: cada inscripción elige presencial o virtual.${def.cupoPresencial ? ` Hay ${def.cupoPresencial} lugares presenciales (aviso al ${AVISO_CUPO_PCT} %${cierre}).` : ' No hay cupo presencial.'}`);
  }
  if (def.unidad === 'grupo') {
    const g = def.grupo;
    const cuantos = g.min === g.max ? `${g.min} personas` : `de ${g.min} a ${g.max} personas`;
    const n = nombreGrupo(def);
    lineas.push(`Se inscriben por ${n.singular}: cada inscripción es ${n.un} ${n.singular} de ${cuantos.replace(/^de /, "")}, con un responsable. ${g.cobro === 'integrante' ? 'Se cobra según cada integrante (se suma lo de cada uno).' : `Se cobra un precio por ${n.singular}, sin importar cuántos sean.`} El cupo y el panel cuentan personas.`);
    const deCada = def.campos.filter((c) => c.porIntegrante).map((c) => c.etiqueta);
    if (deCada.length) lineas.push(`De cada integrante se pide: ${deCada.join(' · ')}.`);
  } else lineas.push(def.unidad === 'pareja' ? 'Se inscriben en pareja: cada inscripción es una pareja y se cobra una vez por pareja.' : 'Cada persona se inscribe por separado.');
  if (def.categorias.length > 0) lineas.push(`Categorías: ${def.categorias.map((c) => `${c.nombre} (${c.edadMin} a ${c.edadMax} años)`).join('; ')}. Quien carga elige la categoría de una lista.`);
  lineas.push(`Se piden ${def.campos.length} datos: ${def.campos.map((c) => (c.obligatorio ? c.etiqueta : `${c.etiqueta} (opcional)`)).join(' · ')}.`);
  const etiqueta = (id) => (def.campos.find((c) => c.id === id) || {}).etiqueta || id;
  const valor = (cond) => {
    const c = def.campos.find((x) => x.id === cond.campo);
    if (!c) return cond.igual;
    if (c.tipo === 'si_no') return cond.igual === 'si' ? '«Sí»' : '«No»';
    return `«${((c.opciones || []).find((o) => o.valor === cond.igual) || {}).etiqueta || cond.igual}»`;
  };
  if (def.sinCobro) lineas.push('No se cobra: es un evento gratuito. El formulario no pide pago.');
  for (const k of def.conceptos) {
    const cuando = k.aplicaSi ? ` solo si en «${etiqueta(k.aplicaSi.campo)}» responde ${valor(k.aplicaSi)}` : '';
    const precio = (t) => (t.porCategoria
      ? def.categorias.filter((c) => t.porCategoria[c.id] !== undefined).map((c) => `${c.nombre} ${pesos(t.porCategoria[c.id])}`).join(', ')
      : pesos(t.monto));
    if (k.precios.length === 2) {
      lineas.push(`Se cobra «${k.nombre}»${cuando}: hasta el ${fechaLarga(k.precios[0].hasta)}, ${precio(k.precios[0])}; después, ${precio(k.precios[1])}.`);
    } else lineas.push(`Se cobra «${k.nombre}»${cuando}: ${precio(k.precios[0])}.`);
  }
  const a = def.asistencia;
  if (!a.toma) lineas.push('No se toma asistencia en la puerta.');
  else {
    const quien = def.unidad === 'pareja' ? (a.modoPareja === 'individual' ? ' (se marca a cada persona por separado)' : ' (se marca a la pareja junta)')
      : def.unidad === 'grupo' ? (a.modoPareja === 'individual' ? ' (se marca a cada integrante por separado)' : ` (se marca ${(() => { const n = nombreGrupo(def); return `a ${n.todo} ${n.el} ${n.singular} ${n.junto}`; })()})`) : '';
    lineas.push(a.instancias.length === 1
      ? `Se toma asistencia una vez: ${a.instancias[0].nombre}${quien}.`
      : `Se toma asistencia ${a.instancias.length} veces${quien}: ${a.instancias.map((i) => i.nombre).join(' · ')}.`);
    if (a.autopresente) lineas.push('Además de la puerta, cada participante puede marcar su presente escaneando un QR con su celular (se anotó solo).');
  }
  return lineas;
}
