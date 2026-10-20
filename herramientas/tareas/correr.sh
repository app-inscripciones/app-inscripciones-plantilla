#!/usr/bin/env bash
# D76 · Punto de entrada de TODAS las tareas automáticas de GitHub (Actions).
# Los archivos de .github/workflows son «cáscaras» mínimas que casi nunca cambian: solo dicen CUÁNDO corre cada tarea
# y llaman a este programa. Lo que cada tarea HACE vive acá, en herramientas/tareas/, y por eso le llega a cada
# institución con el botón «Actualizar» (GitHub no deja que «Actualizar» cambie la carpeta .github).
#
# Uso (desde la cáscara): bash herramientas/tareas/correr.sh <tarea>
# Recibe de la cáscara: SECRETOS (todos los secrets, en JSON), ENTRADAS (los datos que se escriben al tocar
# «Run workflow», en JSON) y GH_TOKEN (la llave temporal que GitHub le da a cada tarea).
set -euo pipefail
TAREA="${1:?Falta el nombre de la tarea}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"

# Cada secret queda como variable con su mismo nombre (SUPABASE_ACCESS_TOKEN, CLAVE_RESPALDO, …).
# Así, si una versión nueva necesita un secret nuevo, no hace falta cambiar la cáscara.
if [ -n "${SECRETOS:-}" ] && [ "$SECRETOS" != "null" ]; then
  eval "$(jq -r 'to_entries[] | select(.key != "github_token") | "export \(.key)=\(.value | @sh)"' <<<"$SECRETOS")"
fi
unset SECRETOS
# Cada dato de «Run workflow» queda en mayúsculas: nombre_institucion → NOMBRE_INSTITUCION.
if [ -n "${ENTRADAS:-}" ] && [ "$ENTRADAS" != "null" ]; then
  eval "$(jq -r 'to_entries[] | "export \(.key | ascii_upcase)=\(.value // "" | tostring | @sh)"' <<<"$ENTRADAS")"
fi
unset ENTRADAS
export GITHUB_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

# La tarea se corre desde una copia aparte: así «Actualizar» puede reemplazar herramientas/ sin pisar
# el programa que está corriendo.
COPIA="${RUNNER_TEMP:-/tmp}/tareas-$$"
rm -rf "$COPIA"; cp -r "$RAIZ/herramientas/tareas" "$COPIA"
[ -f "$COPIA/$TAREA.sh" ] || { echo "::error::No existe la tarea «$TAREA»."; exit 1; }
export TAREAS="$COPIA"
exec bash "$COPIA/$TAREA.sh"
