import { campoVisible } from './reglas.js';
import { esGrupo, camposDelGrupo, camposDeIntegrante, respuestasDeIntegrante, nombreGrupo } from './grupo.js';

export const MEDIOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'terminal', etiqueta: 'Terminal con ticket' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
];

// D45: eventos sin cobro (gratuitos). No tienen conceptos de cobro y la inscripción queda con medio «sin_cobro».
export const SIN_COBRO = 'sin_cobro';
export const esSinCobro = (evento) => !evento.conceptos || evento.conceptos.length === 0;
export const nombreMedio = (m) => (m === SIN_COBRO ? 'Sin cobro' : (MEDIOS_PAGO.find((x) => x.valor === m) || {}).etiqueta || m);

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function validarCampo(campo, valor) {
  const vacio = valor === undefined || valor === null || String(valor).trim() === '';
  if (vacio) return campo.obligatorio ? 'Este dato es obligatorio.' : null;

  switch (campo.tipo) {
    case 'telefono':
      return soloDigitos(valor).length >= 8 ? null : 'Escribí el teléfono completo, con característica (al menos 8 números).';
    case 'dni': {
      const n = soloDigitos(valor).length;
      return n >= 7 && n <= 8 ? null : 'El DNI tiene que tener 7 u 8 números.';
    }
    case 'numero': {
      const n = Number(valor);
      if (!Number.isInteger(n)) return 'Escribí un número entero.';
      if (campo.min !== undefined && n < campo.min) return `El número no puede ser menor que ${campo.min}.`;
      if (campo.max !== undefined && n > campo.max) return `El número no puede ser mayor que ${campo.max}.`;
      return null;
    }
    default:
      return null;
  }
}

// Clave del error de un dato de un integrante (para mostrarlo al lado del dato).
export const claveIntegrante = (idIntegrante, idCampo) => `${idIntegrante}.${idCampo}`;

// Grupos (D61): datos del grupo, cantidad de integrantes (mínimo y máximo), un responsable,
// los datos de cada integrante y que no se repita un DNI dentro del grupo.
function validarGrupo(evento, respuestas, errores) {
  const { integrantes = [], ...delGrupo } = respuestas || {};
  const g = evento.grupo || {};
  const nombres = nombreGrupo(evento);
  for (const campo of camposDelGrupo(evento)) {
    if (!campoVisible(campo, delGrupo)) continue;
    const error = validarCampo(campo, delGrupo[campo.id]);
    if (error) errores[campo.id] = error;
  }
  if (integrantes.length < (g.min || 1)) {
    errores.integrantes = `Faltan integrantes: cada ${nombres.singular} tiene que tener ${g.min === g.max ? g.min : `entre ${g.min} y ${g.max}`} personas (cargaste ${integrantes.length}).`;
  } else if (g.max && integrantes.length > g.max) {
    errores.integrantes = `Sobran integrantes: cada ${nombres.singular} puede tener hasta ${g.max} personas (cargaste ${integrantes.length}).`;
  } else if (integrantes.filter((x) => x.responsable).length !== 1) {
    errores.integrantes = `Marcá quién es el responsable ${nombres.del} ${nombres.singular} (uno solo).`;
  }
  const dnis = new Map();
  integrantes.forEach((x, k) => {
    if (evento.categorias.length > 0 && !x.categoria) errores[claveIntegrante(x.id, 'categoria')] = 'Elegí la categoría.';
    const r = respuestasDeIntegrante(delGrupo, x);
    for (const campo of camposDeIntegrante(evento)) {
      if (!campoVisible(campo, { ...r, categoria: x.categoria })) continue;
      const error = validarCampo(campo, r[campo.id]);
      if (error) errores[claveIntegrante(x.id, campo.id)] = error;
    }
    const dni = soloDigitos(x.dni);
    if (dni) {
      if (dnis.has(dni)) errores[claveIntegrante(x.id, 'dni')] = `Este DNI ya está cargado en el integrante ${dnis.get(dni) + 1}.`;
      else dnis.set(dni, k);
    }
  });
}

// Devuelve un objeto { idCampo: mensaje } con los errores. Vacío = todo bien.
export function validar(evento, respuestas, pago) {
  const errores = {};
  if (esGrupo(evento)) {
    validarGrupo(evento, respuestas, errores);
    return validarPago(evento, pago, errores);
  }
  if (evento.categorias.length > 0 && !respuestas.categoria) {
    errores.categoria = 'Elegí la categoría.';
  }
  for (const campo of evento.campos) {
    if (!campoVisible(campo, respuestas)) continue;
    const error = validarCampo(campo, respuestas[campo.id]);
    if (error) errores[campo.id] = error;
  }
  return validarPago(evento, pago, errores);
}

function validarPago(evento, pago, errores) {
  if (esSinCobro(evento)) return errores;
  if (!pago.medio) errores.medio = 'Elegí el medio de pago.';
  if (pago.medio === 'transferencia') {
    if (!pago.banco || !pago.banco.trim()) errores.banco = 'Escribí el banco o la billetera.';
    if (!/^[A-Z0-9]{6}$/.test(pago.ultimos6 || '')) errores.ultimos6 = 'Tienen que ser exactamente 6 caracteres (letras o números).';
  }
  return errores;
}

// Avisos que no impiden guardar: el cargador decide.
export function avisos(evento, respuestas) {
  if (esGrupo(evento)) {
    const { integrantes = [], ...delGrupo } = respuestas || {};
    return integrantes.flatMap((x, k) => avisos({ ...evento, unidad: 'persona' }, { ...respuestasDeIntegrante(delGrupo, x), categoria: x.categoria })
      .map((a) => `Integrante ${k + 1}${x.nombre ? ` (${x.nombre})` : ''}: ${a}`));
  }
  const lista = [];
  const cat = evento.categorias.find((c) => c.id === respuestas.categoria);
  const edad = Number(respuestas.edad);
  if (cat && respuestas.edad !== undefined && respuestas.edad !== '' && Number.isInteger(edad)) {
    if (edad < cat.edadMin || edad > cat.edadMax) {
      lista.push(
        `La edad (${edad} años) no coincide con la categoría «${cat.nombre}». Revisá si la categoría es correcta.` +
          (cat.nota ? ` (${cat.nota}.)` : '')
      );
    }
  }
  return lista;
}
