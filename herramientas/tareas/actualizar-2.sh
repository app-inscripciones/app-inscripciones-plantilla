#!/usr/bin/env bash
# Segunda parte de «Actualizar» (la corre la versión nueva): bases, prueba, publicación y resumen.
set -euo pipefail
source "$TAREAS/comun.sh"
terminar() {
  local estado=$?
  if [ "$estado" = 0 ]; then
    resumen "## ✅ Actualización terminada"; resumen ""
    resumen "La app y las bases quedaron en la versión $(node -p 'require("./package.json").version'). No se perdió ningún dato. En los celulares, la versión nueva aparece sola la próxima vez que abran la app con internet."
    if [ "${TAREAS_DISTINTAS:-}" = "1" ]; then
      resumen ""
      resumen "ℹ️ Algunas tareas automáticas de GitHub (la carpeta .github) tienen pequeñas diferencias con la plantilla. **No hace falta hacer nada**: la app funciona igual."
    fi
  else
    resumen "## ❌ La actualización no terminó"; resumen ""
    resumen "No se perdió ningún dato. Tocá la fila en rojo, leé el mensaje y volvé a tocar **Run workflow** (no «Re-run jobs»). Si sigue fallando, buscá el mensaje en «¿Qué hago si…?»."
  fi
}
trap terminar EXIT
echo "::group::Actualizar las bases"
node herramientas/instalador/actualizar.mjs
echo "::endgroup::"
echo "::group::Probar y preparar la app"
preparar_app
echo "::endgroup::"
echo "::group::Publicar"
publicar_app
echo "::endgroup::"
