# Funciones que comparten las tareas (se cargan con: source "$TAREAS/comun.sh").
resumen() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }
a_entorno() { if [ -n "${GITHUB_ENV:-}" ]; then echo "$1=$2" >> "$GITHUB_ENV"; fi; export "$1=$2"; }
ocultar() { [ -n "${1:-}" ] && echo "::add-mask::$1" || true; }
# Deja un archivo listo para que la cáscara lo guarde 90 días en GitHub («Artifacts»), con ese nombre.
para_guardar() { mkdir -p salida/subir; cp "$2" salida/subir/; a_entorno ARTEFACTO "$1"; }
subir_cambios() {  # $1 = mensaje del cambio
  git config user.name "${AUTOR_GIT:-Sistema}"
  git config user.email "sistema@users.noreply.github.com"
  if git diff --cached --quiet; then echo "Sin cambios."; return 0; fi
  git commit -q -m "$1"
  git push -q || { git pull --rebase -q && git push -q; }
}
instalado() { [ -f config/instalacion.json ] || [ -n "${SUPABASE_DB_URL:-}" ]; }
instalado_con_boton() { [ -f config/instalacion.json ] && [ "$(jq -r '.app.proyectoCloudflare // empty' config/instalacion.json)" != "" ]; }
preparar_app() { npm ci; npm test -- --reporter=dot; npm run build; }  # dot: sin el informe técnico en el resumen
publicar_app() {
  local proyecto cuenta
  proyecto=$(jq -r .app.proyectoCloudflare config/instalacion.json)
  cuenta="${CLOUDFLARE_ACCOUNT_ID:-$(jq -r '.app.cuentaCloudflare // empty' config/instalacion.json)}"
  CLOUDFLARE_ACCOUNT_ID="$cuenta" npx --yes wrangler@4 pages deploy dist --project-name "$proyecto" --branch main --commit-dirty=true
}
# Conexión a una base: real | pruebas. Instalación a mano (caso testigo): SUPABASE_DB_URL / SUPABASE_DB_URL_PRUEBAS.
url_base() {
  local cual="$1" manual
  if [ "$cual" = real ]; then manual="${SUPABASE_DB_URL:-}"; else manual="${SUPABASE_DB_URL_PRUEBAS:-}"; fi
  if [ -n "$manual" ]; then echo "$manual"
  elif [ -f config/instalacion.json ] && [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -n "${CLAVE_RESPALDO:-}" ]; then node herramientas/instalador/url-base.mjs "$cual"
  else return 1; fi
}
