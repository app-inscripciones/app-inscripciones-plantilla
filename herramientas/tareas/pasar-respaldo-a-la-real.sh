#!/usr/bin/env bash
# Tarea «Pasar un respaldo a la base real» (D59). Reemplaza TODOS los datos de la base real por los de ese día.
# Datos: FECHA y CONFIRMACION (tiene que ser exactamente «REEMPLAZAR LA BASE REAL»).
# Antes guarda una copia cifrada de cómo estaba la base real («antes-de-recuperar-…», 90 días) para poder deshacer.
set -euo pipefail
source "$TAREAS/comun.sh"
if [ "${CONFIRMACION:-}" != "REEMPLAZAR LA BASE REAL" ]; then
  echo "::error::No se hizo nada. Para reemplazar la base real hay que escribir exactamente: REEMPLAZAR LA BASE REAL"
  resumen "❌ No se hizo nada: la confirmación no coincide."
  exit 1
fi
URL_DESTINO=$(url_base real) || { echo "::error::Falta la conexión a la base real (SUPABASE_DB_URL o SUPABASE_ACCESS_TOKEN)."; exit 1; }
ocultar "$URL_DESTINO"
export URL_DESTINO DESTINO=real
ESTADO=0
bash herramientas/recuperar/recuperar.sh || ESTADO=$?
# La copia previa se guarda aunque algo haya fallado después.
COPIA=$(ls salida/antes-de-recuperar-*.dump.gpg 2>/dev/null | head -1 || true)
if [ -n "$COPIA" ]; then para_guardar "$(basename "$COPIA" .dump.gpg)" "$COPIA"; fi
exit $ESTADO
