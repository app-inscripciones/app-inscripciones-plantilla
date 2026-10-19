#!/usr/bin/env bash
# Recuperar un respaldo (D59). Lo usan los workflows «Recuperar respaldo (en la base de pruebas)» y
# «Pasar un respaldo a la base real». Pasos:
#   1. Busca el respaldo del día pedido (o el más reciente) entre los «Artifacts» del respaldo diario y lo baja.
#   2. Lo descifra con CLAVE_RESPALDO.
#   3. Si el destino es la base REAL: antes hace una copia cifrada de cómo está ahora (red de seguridad).
#   4. En UNA SOLA operación: vacía las tablas y funciones de la aplicación en la base de destino, carga la copia y
#      vuelve a cargar base-de-datos-completa (la pone al día con la versión actual y restablece los permisos).
#      Si algo falla, la base de destino queda exactamente como estaba.
#   5. Cuenta lo recuperado.
#
# Variables: DESTINO (pruebas | real), FECHA (AAAA-MM-DD, vacía = el más reciente; o el nombre de una copia
#            «antes-de-recuperar-…» para deshacer una recuperación), CLAVE_RESPALDO, URL_DESTINO,
#            GH_TOKEN y GITHUB_REPOSITORY (para bajar el respaldo), SALIDA (carpeta de trabajo, por defecto «salida»).
# Para probar sin GitHub: RESPALDO_ARCHIVO=archivo.dump.gpg y PG_HERRAMIENTAS=local.
set -euo pipefail
cd "$(dirname "$0")/../.."
SALIDA=${SALIDA:-salida}
mkdir -p "$SALIDA"
resumen() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }
falla() { echo "::error::$*"; resumen "❌ $*"; exit 1; }

[ "${DESTINO:-}" = pruebas ] || [ "${DESTINO:-}" = real ] || falla "DESTINO tiene que ser «pruebas» o «real»."
[ -n "${CLAVE_RESPALDO:-}" ] || falla "Falta el secret CLAVE_RESPALDO."
[ -n "${URL_DESTINO:-}" ] || falla "No hay conexión con la base de ${DESTINO} (ver el manual de instalación, «Recuperar un respaldo»)."
FECHA=$(echo "${FECHA:-}" | tr -d '[:space:]')
if [ -n "$FECHA" ] && ! [[ "$FECHA" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ || "$FECHA" =~ ^antes-de-recuperar-[0-9_-]+$ ]]; then
  falla "La fecha tiene que escribirse así: 2026-10-13 (año-mes-día). Para deshacer, el nombre completo de la copia «antes-de-recuperar-…»."
fi

# Herramientas de PostgreSQL 17 (las mismas del respaldo diario), o las locales para probar.
if [ "${PG_HERRAMIENTAS:-docker}" = docker ]; then
  pg() { docker run --rm --network host -v "$PWD:/w" -w /w postgres:17 "$@"; }
else
  pg() { "$@"; }
fi

# 1. El respaldo ---------------------------------------------------------------------------------------
if [ -n "${RESPALDO_ARCHIVO:-}" ]; then
  cp "$RESPALDO_ARCHIVO" "$SALIDA/elegido.dump.gpg"; NOMBRE=$(basename "$RESPALDO_ARCHIVO")
else
  FILTRO='[.artifacts[] | select(.expired | not) | select(.name | startswith("respaldo-") or startswith("antes-de-recuperar-"))]'
  if [[ "$FECHA" == antes-de-recuperar-* ]]; then FILTRO="$FILTRO | map(select(.name == \"$FECHA\"))"
  elif [ -n "$FECHA" ]; then FILTRO="$FILTRO | map(select(.name == \"respaldo-$FECHA\"))"
  else FILTRO="$FILTRO | map(select(.name | startswith(\"respaldo-\")))"; fi
  gh api --paginate "repos/$GITHUB_REPOSITORY/actions/artifacts?per_page=100" | jq -s '{artifacts: (map(.artifacts) | add)}' \
    | jq -c "$FILTRO | sort_by(.created_at) | reverse | .[0] // empty" > "$SALIDA/artefacto.json"
  [ -s "$SALIDA/artefacto.json" ] || falla "No hay ningún respaldo${FECHA:+ del $FECHA}. Los respaldos se guardan 90 días: mirá las fechas en Actions → «Respaldo diario»."
  ID=$(jq -r .id "$SALIDA/artefacto.json"); NOMBRE=$(jq -r .name "$SALIDA/artefacto.json")
  gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$ID/zip" > "$SALIDA/respaldo.zip"
  unzip -o -q "$SALIDA/respaldo.zip" -d "$SALIDA/zip"
  mv "$SALIDA"/zip/*.dump.gpg "$SALIDA/elegido.dump.gpg"
fi
resumen "## Recuperar respaldo → base de ${DESTINO}"
resumen "Respaldo elegido: **${NOMBRE}**"

# 2. Descifrar -----------------------------------------------------------------------------------------
gpg --batch --yes --pinentry-mode loopback --passphrase "$CLAVE_RESPALDO" -d -o "$SALIDA/elegido.dump" "$SALIDA/elegido.dump.gpg" 2>/dev/null \
  || falla "No se pudo abrir el respaldo con la CLAVE_RESPALDO actual. Si la clave se cambió, los respaldos anteriores necesitan la clave vieja (hoja de accesos)."
pg pg_restore -l "$SALIDA/elegido.dump" > /dev/null || falla "El archivo del respaldo está dañado. Probá con otra fecha."

# 3. Red de seguridad (solo para la base real) --------------------------------------------------------
if [ "$DESTINO" = real ]; then
  AHORA=$(TZ=America/Argentina/Buenos_Aires date +%Y-%m-%d_%H%M)
  pg pg_dump "$URL_DESTINO" --schema=public --no-owner --no-privileges --format=custom --file="$SALIDA/antes.dump" \
    || falla "No se pudo copiar la base real antes de recuperar. No se cambió nada."
  gpg --batch --yes --pinentry-mode loopback --passphrase "$CLAVE_RESPALDO" --symmetric --cipher-algo AES256 \
      -o "$SALIDA/antes-de-recuperar-$AHORA.dump.gpg" "$SALIDA/antes.dump"
  rm "$SALIDA/antes.dump"
  echo "COPIA_PREVIA=antes-de-recuperar-$AHORA" >> "${GITHUB_ENV:-/dev/null}"
  resumen "Antes de recuperar se guardó una copia de cómo estaba la base real: **antes-de-recuperar-$AHORA** (en «Artifacts», 90 días)."
fi

# 4 y 5. Vaciar, cargar y poner al día, TODO EN UNA SOLA OPERACIÓN (transacción): si cualquier parte falla,
# la base de destino vuelve sola a como estaba. Nunca queda a medio cargar.
pg pg_restore --no-owner --no-privileges -f "$SALIDA/carga.sql" "$SALIDA/elegido.dump"
# La copia trae «CREATE SCHEMA public» (el esquema ya existe en Supabase): se saca.
grep -v -E '^(CREATE SCHEMA public;|COMMENT ON SCHEMA public )' "$SALIDA/carga.sql" > "$SALIDA/carga-limpia.sql"
node herramientas/sql/armar_completo.mjs "$SALIDA/completo.sql" > /dev/null
pg psql "$URL_DESTINO" -X -q -v ON_ERROR_STOP=1 --single-transaction \
    -c "set local recuperar.confirmado = 'si'" \
    -f herramientas/recuperar/vaciar_public.sql -f "$SALIDA/carga-limpia.sql" -f "$SALIDA/completo.sql" > "$SALIDA/carga.log" 2>&1 \
  || { tail -5 "$SALIDA/carga.log"; falla "No se pudo cargar el respaldo en la base de ${DESTINO}. No se cambió nada: la base quedó como estaba."; }

pg psql "$URL_DESTINO" -X -At -c "
  select 'Eventos: ' || count(*) from public.eventos where estado <> 'borrador'
  union all select 'Inscripciones: ' || count(*) from public.inscripciones
  union all select 'Rendiciones: ' || count(*) from public.rendiciones
  union all select 'Personas del panel: ' || count(*) from public.usuarios
  union all select 'Última inscripción recibida: ' || coalesce(to_char(max(recibida_en) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), '—') from public.inscripciones" > "$SALIDA/conteo.txt"
resumen "✅ Respaldo recuperado en la base de **${DESTINO}**:"
resumen '```'; resumen "$(cat "$SALIDA/conteo.txt")"; resumen '```'
rm -f "$SALIDA/elegido.dump" "$SALIDA/completo.sql" "$SALIDA/carga.sql" "$SALIDA/carga-limpia.sql"
