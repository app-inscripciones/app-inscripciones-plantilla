import { db, leerAjuste, guardarAjuste, nuevoId } from './db.js';
import { llamarFuncion, claveTokenSesion } from './sincronizacion.js';
import { diaLocal } from '../logica/fechas.js';

// Control de presentes en la puerta (Etapa 4B, R15).
// La lista de inscriptos se guarda en el celular para buscar y marcar sin internet.
// Las marcas se guardan primero en el celular y se envían solas; con internet,
// cada pocos segundos se traen las marcas de los otros celulares de la puerta.

// ---------------- Búsqueda ----------------
export const normalizar = (t) =>
  String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Lo que se puede buscar de una inscripción: sus datos y, en los grupos, el nombre y el DNI de cada integrante.
export const valoresBuscables = (ins) => [
  ...Object.values(ins.datos || {}),
  ...((ins.integrantes || []).flatMap((x) => [x.nombre, x.dni])),
].filter((v) => v !== undefined && v !== null);
export function textoBusqueda(ins) {
  return normalizar(valoresBuscables(ins).join(' '));
}
export const soloDigitos = (t) => String(t || '').replace(/\D/g, '');

// Todas las palabras escritas tienen que aparecer (en cualquier orden). Los números se buscan
// en el DNI o teléfono sin puntos ni espacios, y también como número de orden exacto.
export function buscar(lista, consulta, max = 30) {
  const q = normalizar(consulta);
  if (q.length < 2 && soloDigitos(q).length < 2) return [];
  const palabras = q.split(' ').filter(Boolean);
  const res = [];
  for (const ins of lista) {
    const texto = ins.busqueda || textoBusqueda(ins);
    const digitos = ins.digitos || soloDigitos(valoresBuscables(ins).join(' '));
    const ok = palabras.every((p) => {
      const d = soloDigitos(p);
      if (d.length === p.replace(/[.\-\s]/g, '').length && d.length > 0) {
        return (d.length >= 3 && digitos.includes(d)) || String(ins.n) === d;
      }
      return texto.includes(p);
    });
    if (ok) res.push(ins);
    if (res.length >= max) break;
  }
  return res;
}

// ---------------- Instancia que corresponde ahora ----------------
const turnoDeHora = (h) => (h < 13 ? 'mañana' : h < 19 ? 'tarde' : 'noche');
export function instanciaPropuesta(instancias, ahora = new Date()) {
  if (!instancias || instancias.length === 0) return null;
  const hoy = diaLocal(ahora);
  const deHoy = instancias.filter((i) => i.fecha === hoy);
  if (deHoy.length) {
    const hora = Number(new Intl.DateTimeFormat('es-AR', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora));
    return deHoy.find((i) => i.turno === turnoDeHora(hora)) || deHoy.find((i) => !i.turno) || deHoy[0];
  }
  const proximas = instancias.filter((i) => i.fecha > hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return proximas[0] || instancias[instancias.length - 1];
}

// ---------------- Estado de presente ----------------
// Devuelve la marca vigente (la más temprana) de una inscripción en una instancia (y persona).
export function marcaVigente(marcas, inscripcionId, instancia, persona = '') {
  let mejor = null;
  for (const m of marcas) {
    if (m.inscripcionId !== inscripcionId || m.instancia !== instancia || (m.persona || '') !== persona || m.estado !== 'presente') continue;
    if (!mejor || m.marcadaEn < mejor.marcadaEn) mejor = m;
  }
  return mejor;
}

export function contarPresentes(marcas, instancia, porPersona, anuladas = new Set()) {
  const vistos = new Set();
  for (const m of marcas) {
    if (m.instancia !== instancia || m.estado !== 'presente' || anuladas.has(m.inscripcionId)) continue;
    vistos.add(porPersona ? `${m.inscripcionId}|${m.persona}` : m.inscripcionId);
  }
  return vistos.size;
}

// ---------------- Datos locales ----------------
export async function leerPuerta() {
  const [inscripciones, marcas, asistencia] = await Promise.all([db.puerta.toArray(), db.marcas.toArray(), leerAjuste('puertaAsistencia')]);
  return { inscripciones, marcas, asistencia };
}

export async function marcar({ inscripcionId, instancia, persona = '', sesionId, colaborador }) {
  const m = { id: nuevoId(), inscripcionId, instancia, persona, marcadaEn: new Date().toISOString(), marcadoPor: colaborador,
    estado: 'presente', propia: true, envio: 'pendiente', sesionId };
  await db.marcas.add(m);
  return m;
}

export async function deshacer(id) {
  await db.marcas.update(id, { estado: 'deshecha', envio: 'pendiente' });
}

export async function pendientesPuerta() {
  return db.marcas.where('envio').equals('pendiente').count();
}

// ---------------- Sincronización ----------------
let enCurso = null;
export function sincronizarPuerta(sesionId, fetchFn = fetch) {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const res = { enviadas: 0, sinConexion: false, error: null };
    try {
      const token = await leerAjuste(claveTokenSesion(sesionId));
      if (!token) return { ...res, error: 'sesion_invalida' };

      // 1) Enviar las marcas propias pendientes (de esta sesión).
      const pendientes = await db.marcas.where('envio').equals('pendiente').toArray();
      const propias = pendientes.filter((m) => m.sesionId === sesionId);
      if (propias.length) {
        let r;
        try {
          r = await llamarFuncion('enviar_marcas', {
            p_token: token,
            p_marcas: propias.map((m) => ({ id: m.id, inscripcionId: m.inscripcionId, instancia: m.instancia, persona: m.persona, marcadaEn: m.marcadaEn, estado: m.estado })),
          }, fetchFn);
        } catch {
          return { ...res, sinConexion: true };
        }
        if (!r || !r.ok) return { ...res, error: (r && r.error) || 'datos_invalidos' };
        const resultados = Object.fromEntries((r.resultados || []).map((x) => [x.id, x.resultado]));
        await db.transaction('rw', db.marcas, async () => {
          for (const m of propias) {
            const x = resultados[m.id];
            if (x === 'ok' || x === 'repetida' || x === 'ya_presente') await db.marcas.update(m.id, { envio: 'enviada' });
            else if (x) await db.marcas.update(m.id, { envio: 'rechazada', motivo: x });
          }
        });
        res.enviadas = propias.length;
      }

      // 2) Traer lo que cambió (inscripciones nuevas o corregidas, marcas de otros celulares).
      const desde = await leerAjuste('puertaDesde');
      let l;
      try {
        l = await llamarFuncion('lista_puerta', { p_token: token, p_desde: desde || null }, fetchFn);
      } catch {
        return { ...res, sinConexion: true };
      }
      if (!l || !l.ok) return { ...res, error: (l && l.error) || 'datos_invalidos' };
      await db.transaction('rw', db.puerta, db.marcas, db.ajustes, async () => {
        if (l.inscripciones.length) {
          await db.puerta.bulkPut(l.inscripciones.map((i) => ({
            ...i, busqueda: textoBusqueda(i), digitos: soloDigitos(valoresBuscables(i).join(' ')),
          })));
        }
        for (const m of l.marcas) {
          const local = await db.marcas.get(m.id);
          if (local && local.envio === 'pendiente') continue; // lo propio sin enviar manda
          await db.marcas.put({ ...m, persona: m.persona || '', propia: local ? local.propia : false, envio: 'enviada', sesionId: local ? local.sesionId : null });
        }
        await guardarAjuste('puertaAsistencia', l.asistencia);
        await guardarAjuste('puertaDesde', l.ahora);
        await guardarAjuste('puertaUltimaSinc', new Date().toISOString());
      });
      return res;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

// Al terminar el acceso: se borra la lista del celular (datos personales). Lo pendiente se conserva.
export async function borrarPuerta() {
  await db.transaction('rw', db.puerta, db.marcas, db.ajustes, async () => {
    await db.puerta.clear();
    await db.marcas.where('envio').notEqual('pendiente').delete();
    await db.ajustes.bulkDelete(['puertaDesde', 'puertaAsistencia', 'puertaUltimaSinc']);
  });
}
