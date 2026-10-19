// Pasa la guía «¿Qué hago si…?» de la app (src/ayuda/queHagoSi.js) a texto para imprimir (que-hago-si.md).
// Uso: node herramientas/guias-rapidas/que_hago_si_md.mjs > que-hago-si.md
import { SECCIONES } from '../../src/ayuda/queHagoSi.js';
let t = '# ¿Qué hago si…?\n\nProblemas frecuentes y qué hacer, en palabras simples. La misma guía está dentro de la app (botón «¿Qué hago si…?»).\n';
for (const s of SECCIONES) {
  t += `\n## ${s.titulo}\n`;
  for (const c of s.casos) t += `\n### ${c.pregunta}\n\n` + c.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n';
}
process.stdout.write(t);
