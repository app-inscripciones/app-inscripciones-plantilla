#!/usr/bin/env bash
# Tarea «Respaldo diario» (D18): copia completa de la base real, CIFRADA con CLAVE_RESPALDO, guardada 90 días en
# GitHub («Artifacts»), con prueba de recuperación en una base vacía. Al conectarse, evita que Supabase pause la base.
# Antes de tocar «Instalar» no hay nada que respaldar: termina en verde sin hacer nada (para no mandar correos de error).
set -euo pipefail
source "$TAREAS/comun.sh"
if ! instalado; then resumen "Todavía no se tocó el botón «Instalar»: no hay nada que hacer."; exit 0; fi

echo "::group::Despertar las bases si están pausadas (D74)"
node herramientas/instalador/despertar.mjs || echo "::warning::No se pudo revisar si las bases estaban pausadas."
echo "::endgroup::"

[ -n "${CLAVE_RESPALDO:-}" ] || { echo "::error::Falta el secret CLAVE_RESPALDO (ver el manual, sección de respaldos)."; exit 1; }
URL=$(url_base real) || { echo "::error::Falta SUPABASE_DB_URL (instalación a mano) o SUPABASE_ACCESS_TOKEN (instalación automática)."; exit 1; }
ocultar "$URL"
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  # Mantiene activa también la base de pruebas (el plan gratuito pausa las bases sin uso).
  REF=$(jq -r .supabase.pruebas.ref config/instalacion.json)
  curl -sf -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    -d '{"query":"select 1"}' > /dev/null || echo "::warning::No se pudo tocar la base de pruebas."
fi

echo "::group::Copiar los datos de la base"
mkdir -p salida
docker run --rm -v "$PWD/salida:/salida" -e URL="$URL" postgres:17 \
  sh -c 'pg_dump "$URL" --schema=public --no-owner --no-privileges --format=custom --file=/salida/respaldo.dump'
ls -l salida
echo "::endgroup::"

# D56: los eventos de práctica se borran solos al terminar su semana (después de copiarlos). Nunca frena el respaldo.
docker run --rm -e URL="$URL" postgres:17 psql "$URL" -v ON_ERROR_STOP=1 -q -c \
  "do \$\$ begin if to_regprocedure('public.limpiar_practicas()') is not null then raise notice 'Prácticas borradas: %', public.limpiar_practicas(); end if; end \$\$;" \
  || echo "::warning::No se pudieron borrar los eventos de práctica vencidos."

echo "::group::Cifrar la copia"
FECHA=$(TZ=America/Argentina/Buenos_Aires date +%Y-%m-%d)
gpg --batch --yes --pinentry-mode loopback --passphrase "$CLAVE_RESPALDO" \
    --symmetric --cipher-algo AES256 -o "salida/respaldo-$FECHA.dump.gpg" salida/respaldo.dump
rm salida/respaldo.dump
para_guardar "respaldo-$FECHA" "salida/respaldo-$FECHA.dump.gpg"
echo "::endgroup::"

echo "::group::Prueba de recuperación en una base vacía"
gpg --batch --yes --pinentry-mode loopback --passphrase "$CLAVE_RESPALDO" -d -o salida/prueba.dump "salida/respaldo-$FECHA.dump.gpg"
docker run -d --name prueba -e POSTGRES_PASSWORD=prueba -v "$PWD/salida:/salida" postgres:17 > /dev/null
for i in $(seq 1 30); do docker exec prueba pg_isready -U postgres && break; sleep 2; done
docker exec prueba psql -U postgres -v ON_ERROR_STOP=1 -q -c "
  drop schema public cascade;
  create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
  create schema extensions; create extension pgcrypto with schema extensions;
  create schema auth; create function auth.jwt() returns jsonb language sql stable as \$\$ select '{}'::jsonb \$\$;"
docker exec prueba pg_restore -U postgres -d postgres --no-owner --no-privileges /salida/prueba.dump
docker exec prueba psql -U postgres -At -c "
  select 'eventos: ' || count(*) from public.eventos
  union all select 'inscripciones: ' || count(*) from public.inscripciones
  union all select 'rendiciones: ' || count(*) from public.rendiciones
  union all select 'usuarios: ' || count(*) from public.usuarios" | tee conteo.txt
echo "::endgroup::"
resumen "## Respaldo del $FECHA"
resumen "Copia cifrada guardada y **recuperada con éxito** en una base de prueba:"
resumen '```'; resumen "$(cat conteo.txt)"; resumen '```'
