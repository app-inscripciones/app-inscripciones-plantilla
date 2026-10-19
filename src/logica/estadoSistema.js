// Etapa 9, punto 4 (D58): estado del sistema para el Responsable general.
// Junta el resultado de la última revisión diaria (la hace GitHub y la guarda en la base) con lo que el panel
// puede comprobar en el momento: si la revisión dejó de correr, la versión de la base y el espacio.

export const VERSION_BASE = 22; // número del último archivo de supabase/ (la prueba lo controla)
export const HORAS_REVISION = 36;

const item = (id, estado, titulo, detalle = '', queHacer = '') => ({ id, estado, titulo, detalle, queHacer });

export function evaluarEstado(r) {
  if (!r || !r.ok) return { items: [], problemas: 0, avisos: 0, nunca: false };
  const items = [];
  const ultima = r.ultima;
  if (!ultima) {
    items.push(item('revision', 'aviso', 'Todavía no corrió la revisión diaria',
      'Se hace sola todos los días a la mañana. Si recién se instaló el sistema, mañana ya va a aparecer acá.',
      'Para hacerla ahora: GitHub → pestaña «Actions» → «Revisión diaria» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo).'));
  } else {
    if (r.horasDesdeUltima > HORAS_REVISION) {
      items.push(item('revision', 'problema', `La revisión diaria no corre hace ${Math.round(r.horasDesdeUltima / 24)} días`,
        'Si la revisión no corre, el sistema no puede avisar cuando algo anda mal.',
        'GitHub → pestaña «Actions» → «Revisión diaria». Si dice que está desactivada, tocá «Enable workflow». Después tocá «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo).'));
    }
    // Lo que la base dice en el momento reemplaza a lo que dijo la revisión (por ejemplo, después de «Actualizar»).
    const enVivo = new Set(['version', 'espacio']);
    for (const x of ultima.resultados || []) if (!enVivo.has(x.id)) items.push(x);
  }
  if (r.version != null && Number(r.version) < VERSION_BASE) {
    items.push(item('version', 'aviso', 'Falta actualizar la base de datos', `La base está en la versión ${r.version} y la app en la ${VERSION_BASE}.`,
      'GitHub → pestaña «Actions» → «Actualizar» → «Run workflow» (el botón verde de arriba a la derecha; en el panel que se abre, otra vez «Run workflow», abajo de todo). Tarda unos 5 minutos y no se pierden datos.'));
  } else if (r.version != null) items.push(item('version', 'ok', 'Versión de la base', `Al día (versión ${r.version}).`));
  if (r.espacioUsado != null && r.espacioLimite) {
    const pct = Math.round((100 * r.espacioUsado) / r.espacioLimite);
    const mb = Math.round(r.espacioUsado / 1048576);
    const estado = pct >= 95 ? 'problema' : pct >= 80 ? 'aviso' : 'ok';
    items.push(item('espacio', estado, estado === 'ok' ? 'Espacio de la base' : `La base está al ${pct} % de su espacio`, `Usa ${mb} MB de 500 MB (${pct} %).`,
      estado === 'ok' ? '' : 'Ver en la guía «¿Qué hago si…?»: «La base de datos se está llenando».'));
  }
  const orden = { problema: 0, aviso: 1, ok: 2 };
  items.sort((a, b) => orden[a.estado] - orden[b.estado]);
  return {
    items,
    problemas: items.filter((x) => x.estado === 'problema').length,
    avisos: items.filter((x) => x.estado === 'aviso').length,
    nunca: !ultima,
    respaldoOk: !!(ultima && (ultima.resultados || []).some((x) => x.id === 'respaldo' && x.estado === 'ok')),
  };
}
