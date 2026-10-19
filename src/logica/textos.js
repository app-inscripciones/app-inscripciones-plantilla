// Funciones de texto sin dependencias (se usan también desde las herramientas de Node).

// «Jornada  de PRUEBA» = «jornada de prueba» (sin acentos ni espacios de más), igual que la base (nombre_normal).
export function nombreNormal(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// «2026-10-16» → «16/10/2026».
export function diaComoTexto(dia) {
  const [a, m, d] = String(dia || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : '';
}
