#!/usr/bin/env bash
# Tarea «Recuperar respaldo (en la base de pruebas)» (D59). Nunca toca la base real. Dato: FECHA (vacío = el más reciente).
set -euo pipefail
source "$TAREAS/comun.sh"
URL_DESTINO=$(url_base pruebas) || { echo "::error::Falta la conexión a la base de pruebas (SUPABASE_DB_URL_PRUEBAS o SUPABASE_ACCESS_TOKEN)."; exit 1; }
ocultar "$URL_DESTINO"
export URL_DESTINO DESTINO=pruebas
bash herramientas/recuperar/recuperar.sh
