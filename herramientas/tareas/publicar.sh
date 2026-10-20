#!/usr/bin/env bash
# Tarea «Publicar»: publica la app en Cloudflare Pages cada vez que cambia el código.
# En la copia del caso testigo no hace nada: ahí Cloudflare publica solo desde GitHub.
set -euo pipefail
source "$TAREAS/comun.sh"
if ! instalado_con_boton; then
  echo "Esta copia se publica sola desde GitHub en Cloudflare (caso testigo), o todavía no se instaló: no se publica desde acá."
  exit 0
fi
preparar_app
publicar_app
