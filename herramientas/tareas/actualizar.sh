#!/usr/bin/env bash
# Tarea «Actualizar» (P13): trae la última versión de la plantilla pública (sin tocar config/), actualiza las bases
# (las tablas y los datos se conservan) y vuelve a publicar la app.
# Primera parte: trae el código nuevo. Segunda parte: la corre la versión NUEVA de este programa (actualizar-2.sh),
# así cada actualización ya usa sus propias mejoras.
set -euo pipefail
source "$TAREAS/comun.sh"
trap 'resumen "## ❌ La actualización no terminó"; resumen ""; resumen "No se perdió ningún dato. Tocá la fila en rojo, leé el mensaje y volvé a tocar **Run workflow** (no «Re-run jobs»). Si sigue fallando, buscá el mensaje en «¿Qué hago si…?»."' ERR

if [ ! -f config/instalacion.json ]; then
  echo "::error::Esta copia no se instaló con el botón «Instalar» (falta config/instalacion.json)."; false
fi
if [ "$(jq -r '.app.publicacion // empty' config/instalacion.json)" = "cloudflare-desde-github" ]; then
  # Caso testigo (de donde sale la plantilla): el código ya es el último y Cloudflare publica solo desde GitHub.
  # Solo se ponen al día las bases.
  trap - ERR
  node herramientas/instalador/actualizar.mjs
  resumen "## ✅ Bases al día (caso testigo)"; resumen ""; resumen "Este repositorio es el de origen: no trae código de la plantilla, solo actualizó las bases. No se perdió ningún dato."
  exit 0
fi

echo "::group::Traer la versión nueva de la plantilla"
PLANTILLA=$(jq -r '.plantilla // "https://github.com/app-inscripciones/app-inscripciones-plantilla.git"' config/instalacion.json)
rm -rf /tmp/plantilla
git clone -q --depth 1 "$PLANTILLA" /tmp/plantilla
rsync -a --delete --exclude '.git/' --exclude '.github/' --exclude 'config/' --exclude 'node_modules/' /tmp/plantilla/ ./
rsync -a --ignore-existing /tmp/plantilla/config/ config/
if ! diff -rq /tmp/plantilla/.github .github > /dev/null; then a_entorno TAREAS_DISTINTAS 1; fi
git add -A
AUTOR_GIT=Actualizador subir_cambios "Actualización a la versión $(node -p 'require("./package.json").version')"
echo "::endgroup::"

trap - ERR
# Segunda parte, con el programa recién traído.
cp herramientas/tareas/*.sh "$TAREAS/"
exec bash "$TAREAS/actualizar-2.sh"
