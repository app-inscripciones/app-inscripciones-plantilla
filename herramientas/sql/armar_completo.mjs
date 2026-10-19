// Arma «base-de-datos-completa.txt»: todos los archivos SQL de la base, en orden, en un solo texto
// para pegar en el SQL Editor de Supabase. Sirve para las dos cosas:
//   · crear una base nueva (por ejemplo, la base real del caso testigo), y
//   · poner al día una base que ya existe (todos los archivos se pueden ejecutar más de una vez, sin perder datos).
// Es la misma lista que usan «Instalar» y «Actualizar» (herramientas/instalador/instalar.mjs).
// Uso: node herramientas/sql/armar_completo.mjs [archivo de salida]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ARCHIVOS_SQL } from '../instalador/instalar.mjs';
import { versionCodigo } from '../revision/revisar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const salida = process.argv[2] || path.join(RAIZ, 'base-de-datos-completa.txt');
const version = versionCodigo();
const partes = [
  `-- =====================================================================
-- BASE DE DATOS COMPLETA · versión ${version}
-- Pegar TODO este texto en Supabase → SQL Editor → New query → Run.
-- Sirve para crear una base nueva o para poner al día una que ya existe: se puede ejecutar
-- más de una vez y nunca borra datos. Si Supabase pregunta por «operaciones riesgosas», confirmar.
-- Al final tiene que aparecer: «Base de datos completa y al día (versión ${version})».
-- =====================================================================`,
  ...ARCHIVOS_SQL.map((f) => `\n-- ===================================================================== ${f}\n${readFileSync(path.join(RAIZ, 'supabase', f), 'utf8')}`),
  `\nselect 'Base de datos completa y al día (versión ' || public.version_base() || ')' as resultado;\n`,
];
writeFileSync(salida, partes.join('\n'));
console.log(`${salida}: ${ARCHIVOS_SQL.length} archivos, versión ${version}`);
