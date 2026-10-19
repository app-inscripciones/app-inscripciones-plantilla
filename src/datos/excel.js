// Armado del Excel del evento (Etapa 4.5, D10): hojas Inscriptos, Resumen por cargador y Rendiciones.
// Es una planilla de SOLO CONSULTA: las correcciones se hacen en la app.

import { formatoFechaHora } from '../logica/fechas.js';

const MEDIOS = { efectivo: 'Efectivo', terminal: 'Terminal con ticket', transferencia: 'Transferencia', sin_cobro: 'Sin cobro' };
const PESOS = '"$" #,##0';
const titulo = (value) => ({ value, fontWeight: 'bold', backgroundColor: '#DCE6F1', wrap: true });
const texto = (v) => ({ value: v === null || v === undefined || v === '' ? null : String(v), type: String });
const numero = (v, format) => ({ value: Number(v) || 0, type: Number, ...(format ? { format } : {}) });

function valorCampo(campo, v) {
  if (v === undefined || v === null || v === '') return '';
  if (campo.tipo === 'si_no') return v === 'si' ? 'Sí' : v === 'no' ? 'No' : v;
  if (campo.opciones) return (campo.opciones.find((o) => o.valor === v) || {}).etiqueta || v;
  return v;
}

export function nombreArchivo(evento, ahora = new Date()) {
  const limpio = evento.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = ahora;
  const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${evento.practica ? 'PRACTICA_' : ''}${limpio}_${f}.xlsx`;
}

export function armarHojas(evento, ex) {
  const categorias = Object.fromEntries((evento.categorias || []).map((c) => [c.id, c.nombre]));
  const grupo = evento.unidad === 'grupo';
  // En los grupos (D61), la hoja «Inscriptos» tiene una fila por grupo y la hoja «Integrantes», una por persona.
  const campos = (evento.campos || []).filter((c) => !(grupo && c.porIntegrante));
  const camposIntegrante = grupo ? (evento.campos || []).filter((c) => c.porIntegrante) : [];

  // ---- Inscriptos
  const encabezado = ['Nº', 'Fecha de carga', 'Cargador'];
  if (!grupo && evento.categorias && evento.categorias.length) encabezado.push('Categoría');
  for (const c of campos) encabezado.push(c.etiqueta);
  if (grupo) encabezado.push('Integrantes', 'Responsable');
  encabezado.push('Detalle del cobro', 'Monto', 'Medio de pago', 'Banco o billetera', 'Últimos 6', 'Estado', 'Observaciones');
  // Una columna por cada momento en que se toma asistencia (D29): hora de llegada, o vacío si no vino.
  const pres = ex.presentes && ex.presentes.ok !== false ? ex.presentes : null;
  const instancias = pres && pres.asistencia && pres.asistencia.toma !== false ? pres.porInstancia || [] : [];
  const porPersona = pres && pres.asistencia && pres.asistencia.modoPareja === 'individual';
  for (const inst of instancias) encabezado.push(`Presente – ${inst.nombre}`);
  const marcasDe = {};
  for (const m of (pres && pres.marcas) || []) {
    const k = `${m.inscripcionId}|${m.instancia}`;
    (marcasDe[k] = marcasDe[k] || []).push(m);
  }
  const horaDe = (iso) => formatoFechaHora(iso).split(' ')[1];
  const filas = [encabezado.map(titulo)];
  for (const i of ex.inscripciones) {
    const obs = [];
    if (i.duplicadoDe) obs.push(`Posible duplicado de Nº ${i.duplicadoDe}`);
    if (i.fueraDeHorario) obs.push('Cargada fuera de horario');
    if (i.anuladaMotivo) obs.push(`Motivo de anulación: ${i.anuladaMotivo}`);
    const fila = [numero(i.numeroOrden), texto(formatoFechaHora(i.creadaEn)), texto(i.cargador)];
    if (!grupo && evento.categorias && evento.categorias.length) fila.push(texto(categorias[i.categoria] || i.categoria));
    for (const c of campos) fila.push(texto(valorCampo(c, (i.datos || {})[c.id])));
    if (grupo) {
      const lista = (i.datos && i.datos.integrantes) || [];
      fila.push(numero(lista.length), texto((lista.find((x) => x.responsable) || {}).nombre));
    }
    fila.push(
      texto((i.conceptos || []).map((c) => `${c.nombre || c.id}${c.cantidad > 1 ? ` × ${c.cantidad}` : ''}: $ ${Number(c.monto || 0).toLocaleString('es-AR')}`).join(' · ')),
      numero(i.monto, PESOS),
      texto(MEDIOS[i.medioPago] || i.medioPago),
      texto(i.banco),
      texto(i.ultimos6),
      texto(i.estado === 'anulada' ? 'Anulada' : i.estado === 'posible_duplicado' ? 'Para revisar' : 'Activa'),
      texto(obs.join(' · ')),
    );
    for (const inst of instancias) {
      const ms = (marcasDe[`${i.id}|${inst.id}`] || []).sort((a, b) => a.marcadaEn.localeCompare(b.marcadaEn));
      if (!ms.length) fila.push(texto(''));
      else if (porPersona && grupo) fila.push(texto(`${new Set(ms.map((m) => m.persona)).size} de ${((i.datos || {}).integrantes || []).length}`));
      else if (porPersona) fila.push(texto(ms.map((m) => `${m.persona === 'hombre' ? 'Él' : 'Ella'} ${horaDe(m.marcadaEn)}`).join(' · ')));
      else fila.push(texto(`Sí · ${horaDe(ms[0].marcadaEn)}${ms[0].origen === 'autopresente' ? ' · se anotó solo' : ''}`));
    }
    filas.push(fila);
  }
  const anchos = encabezado.map((h) => ({ width: Math.min(40, Math.max(10, h.length + 2)) }));

  // ---- Integrantes (solo en eventos por grupo): una fila por persona
  let integrantes = null;
  if (grupo) {
    const enc = ['Nº', 'Grupo', 'Integrante', 'Responsable'];
    if (evento.categorias && evento.categorias.length) enc.push('Categoría');
    for (const c of camposIntegrante) enc.push(c.etiqueta);
    enc.push('Estado de la inscripción');
    for (const inst of instancias) enc.push(`Presente – ${inst.nombre}`);
    integrantes = [enc.map(titulo)];
    for (const i of ex.inscripciones) {
      const d = i.datos || {};
      (d.integrantes || []).forEach((x, k) => {
        const fila = [numero(i.numeroOrden), texto(d.nombre_grupo), numero(k + 1), texto(x.responsable ? 'Sí' : '')];
        if (evento.categorias && evento.categorias.length) fila.push(texto(categorias[x.categoria] || x.categoria));
        for (const c of camposIntegrante) fila.push(texto(valorCampo(c, x[c.id])));
        fila.push(texto(i.estado === 'anulada' ? 'Anulada' : i.estado === 'posible_duplicado' ? 'Para revisar' : 'Activa'));
        for (const inst of instancias) {
          const ms = (marcasDe[`${i.id}|${inst.id}`] || []).filter((m) => !porPersona || m.persona === x.id).sort((a, b) => a.marcadaEn.localeCompare(b.marcadaEn));
          fila.push(texto(ms.length ? `Sí · ${horaDe(ms[0].marcadaEn)}${ms[0].origen === 'autopresente' ? ' · se anotó solo' : ''}` : ''));
        }
        integrantes.push(fila);
      });
    }
  }

  // ---- Resumen por cargador
  const r = ex.resumen;
  const d = r.dinero;
  const resumen = [
    [{ value: evento.nombre, fontWeight: 'bold', fontSize: 14 }],
    [texto(`Generado el ${formatoFechaHora(ex.generado)}. Planilla de solo consulta: las correcciones se hacen en la app.`)],
    [],
    [titulo('Inscripciones'), numero(r.inscriptos)],
    [titulo('Personas'), numero(r.personas ?? r.inscriptos)],
    [titulo('Anuladas (no suman)'), numero(r.anuladas)],
    [titulo('Dinero cobrado'), numero(d.total, PESOS)],
    [titulo('Efectivo cobrado'), numero(d.efectivo, PESOS)],
    [titulo('Efectivo rendido'), numero(d.rendido, PESOS)],
    [titulo('Efectivo pendiente de rendir'), numero(d.efectivo - d.rendido, PESOS)],
    [titulo('Tickets de terminal (uno por cobro)'), numero(d.ticketsTerminal)],
    [titulo('Tickets entregados'), numero(d.ticketsRendidos)],
    [titulo('Tickets pendientes de entregar'), numero((d.ticketsTerminal || 0) - (d.ticketsRendidos || 0))],
    [],
    ['Cargador', 'Inscripciones', 'Efectivo cobrado', 'Rendido', 'Falta rendir', 'Terminal', 'Transferencia', 'Total cobrado', 'Tickets terminal', 'Tickets entregados', 'Faltan tickets'].map(titulo),
    ...r.porCargador.map((c) => [
      texto(c.cargador), numero(c.inscripciones), numero(c.efectivo, PESOS), numero(c.rendido, PESOS),
      numero(c.aRendir, PESOS), numero(c.terminal, PESOS), numero(c.transferencia, PESOS), numero(c.total, PESOS),
      numero(c.ticketsTerminal), numero(c.ticketsRendidos), numero(c.ticketsPendientes),
    ]),
  ];
  // Explicación de los números negativos (se rindió de más, por inscripciones anuladas después de rendir)
  const notas = [];
  if (r.porCargador.some((c) => c.aRendir < 0)) notas.push('Un monto negativo en «Falta rendir» significa que se rindió de más (por ejemplo, porque después se anuló una inscripción en efectivo).');
  if (r.porCargador.some((c) => c.ticketsPendientes < 0)) notas.push('Un número negativo en «Faltan tickets» significa que se entregaron tickets de más (por ejemplo, porque después se anuló una inscripción cobrada con la terminal).');
  if (notas.length) resumen.push([], ...notas.map((n) => [texto(n)]));

  // ---- Rendiciones
  const rend = [
    ['Fecha', 'Cargador', 'Efectivo', 'Tickets', 'Recibió', 'Observación', 'Estado'].map(titulo),
    ...ex.rendiciones.map((x) => [
      texto(formatoFechaHora(x.entregadoEn)), texto(x.cargador), numero(x.monto, PESOS), numero(x.tickets), texto(x.recibidoPor),
      texto(x.observacion), texto(x.anulada ? `Anulada: ${x.anuladaMotivo || ''}` : 'Válida'),
    ]),
  ];

  return [
    { sheet: 'Inscriptos', data: filas, columns: anchos, stickyRowsCount: 1 },
    ...(integrantes ? [{ sheet: 'Integrantes', data: integrantes, columns: integrantes[0].map((h) => ({ width: Math.min(40, Math.max(10, String(h.value).length + 2)) })), stickyRowsCount: 1 }] : []),
    { sheet: 'Resumen por cargador', data: resumen, columns: [{ width: 30 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }] },
    { sheet: 'Rendiciones', data: rend, columns: [{ width: 18 }, { width: 24 }, { width: 14 }, { width: 10 }, { width: 22 }, { width: 36 }, { width: 24 }], stickyRowsCount: 1 },
  ];
}

export async function descargarExcel(evento, exportacion) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(armarHojas(evento, exportacion), { fontFamily: 'Calibri', fontSize: 11 }).toFile(nombreArchivo(evento));
}
