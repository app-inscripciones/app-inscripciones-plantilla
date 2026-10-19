#!/usr/bin/env bash
# Prueba de punta a punta de la recuperación de respaldos (D59), contra un PostgreSQL local (puerto 5433, socket /tmp)
# con el «preludio» de las pruebas integradas. No toca GitHub: usa archivos cifrados locales.
# Escenarios: seguro de la limpieza, clave equivocada, una falla a mitad de camino (la base queda intacta),
# recuperar en «pruebas», recuperar en «real» (con copia previa), deshacer con esa copia y un respaldo de una versión vieja.
set -euo pipefail
cd "$(dirname "$0")/../.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
H="-h /tmp -p 5433 -U postgres"
url() { echo "postgres://postgres@localhost:5433/$1?host=/tmp"; }
q() { psql $H -d "$1" -X -At -c "$2"; }
CLAVE=clave-de-prueba-larga-123
nueva_base() {  # nombre, cantidad de inscripciones
  psql $H -q -c "drop database if exists $1 with (force)" -c "create database $1" 2>/dev/null
  sed -n '1,/^\\i/p' herramientas/pruebas-integradas/init_real.sql | grep -v '^\\i' | psql $H -d "$1" -q -v ON_ERROR_STOP=1 >/dev/null
  node herramientas/sql/armar_completo.mjs "$T/completo.sql" >/dev/null
  psql $H -d "$1" -q -v ON_ERROR_STOP=1 -f "$T/completo.sql" -f supabase/002_eventos_modelo.sql >/dev/null 2>&1
  q "$1" "insert into inscripciones (id, evento_id, cargador, creada_en_local, dia_carga, datos, conceptos, monto, medio_pago, categoria)
          select gen_random_uuid(), 'congreso-prueba', 'C '||(g%3), now(), current_date, jsonb_build_object('nombre','$1 '||g), '[]', 3750, 'efectivo', 'adultos'
          from generate_series(1,$2) g" >/dev/null
}
respaldo() {  # base → archivo cifrado
  pg_dump "$(url "$1")" --schema=public --no-owner --no-privileges -Fc -f "$T/$1.dump"
  gpg --batch --yes -q --pinentry-mode loopback --passphrase "$CLAVE" --symmetric --cipher-algo AES256 -o "$2" "$T/$1.dump"
}
recuperar() {  # destino, base, archivo, [clave]
  DESTINO=$1 CLAVE_RESPALDO=${4:-$CLAVE} URL_DESTINO=$(url "$2") RESPALDO_ARCHIVO=$3 PG_HERRAMIENTAS=local SALIDA="$T/salida" \
    bash herramientas/recuperar/recuperar.sh > "$T/log" 2>&1
}
ok() { echo "✅ $*"; }
mal() { echo "❌ $*"; cat "$T/log" 2>/dev/null | tail -5; exit 1; }

nueva_base rec_origen 25; respaldo rec_origen "$T/respaldo-2026-10-12.dump.gpg"
nueva_base rec_destino 7

psql $H -d rec_destino -X -q -v ON_ERROR_STOP=1 -f herramientas/recuperar/vaciar_public.sql >/dev/null 2>&1 && mal "el seguro no frenó la limpieza"
[ "$(q rec_destino 'select count(*) from inscripciones')" = 7 ] && ok "seguro: la limpieza no corre sola" || mal "seguro"

recuperar pruebas rec_destino "$T/respaldo-2026-10-12.dump.gpg" otra-clave && mal "aceptó una clave equivocada"
grep -q "No se pudo abrir el respaldo" "$T/log" && [ "$(q rec_destino 'select count(*) from inscripciones')" = 7 ] && ok "clave equivocada: avisa y no cambia nada" || mal "clave equivocada"

echo "garbage" > "$T/roto.dump"; gpg --batch --yes -q --pinentry-mode loopback --passphrase "$CLAVE" --symmetric -o "$T/roto.dump.gpg" "$T/roto.dump"
recuperar pruebas rec_destino "$T/roto.dump.gpg" && mal "aceptó un respaldo dañado"
[ "$(q rec_destino 'select count(*) from inscripciones')" = 7 ] && ok "respaldo dañado: avisa y no cambia nada" || mal "respaldo dañado"

# Falla a mitad de camino: una carga que se rompe al final no deja la base a medias.
pg_restore --no-owner --no-privileges -f "$T/c.sql" "$T/rec_origen.dump"
grep -v -E '^(CREATE SCHEMA public;|COMMENT ON SCHEMA public )' "$T/c.sql" > "$T/cl.sql"
psql "$(url rec_destino)" -X -q -v ON_ERROR_STOP=1 --single-transaction -c "set local recuperar.confirmado = 'si'" \
  -f herramientas/recuperar/vaciar_public.sql -f "$T/cl.sql" -c "select 1/0" >/dev/null 2>&1 && mal "la falla provocada no falló"
[ "$(q rec_destino 'select count(*) from inscripciones')" = 7 ] && ok "falla a mitad de camino: la base queda exactamente como estaba" || mal "atomicidad"

recuperar pruebas rec_destino "$T/respaldo-2026-10-12.dump.gpg" || mal "recuperar en pruebas"
[ "$(q rec_destino 'select count(*) from inscripciones')" = 25 ] && [ "$(q rec_destino 'select public.version_base()')" = "$(q rec_origen 'select public.version_base()')" ] \
  && ok "recuperar en pruebas: quedan los 25 del respaldo (y no los 7 de antes)" || mal "recuperar en pruebas"
psql $H -d rec_destino -X -q -v ON_ERROR_STOP=1 -c "set role anon; select count(*) from inscripciones" >/dev/null 2>&1 && mal "después de recuperar, cualquiera puede leer las tablas"
ok "después de recuperar, las tablas siguen protegidas"

nueva_base rec_real 12
recuperar real rec_real "$T/respaldo-2026-10-12.dump.gpg" || mal "recuperar en real"
COPIA=$(ls "$T"/salida/antes-de-recuperar-*.dump.gpg)
[ "$(q rec_real 'select count(*) from inscripciones')" = 25 ] && [ -s "$COPIA" ] && ok "recuperar en real: 25 inscripciones y copia previa guardada" || mal "real"
recuperar real rec_real "$COPIA" || mal "deshacer"
[ "$(q rec_real 'select count(*) from inscripciones')" = 12 ] && ok "deshacer con la copia previa: vuelven las 12 de antes" || mal "deshacer"

# Respaldo de una versión vieja (13): se pone al día solo.
psql $H -q -c "drop database if exists rec_v13 with (force)" -c "create database rec_v13" 2>/dev/null
(cat herramientas/pruebas-integradas/init_real.sql; for f in 009 010 011 012 013; do echo "\\i $(ls supabase/${f}_*.sql)"; done) | psql $H -d rec_v13 -q >/dev/null 2>&1
q rec_v13 "insert into inscripciones (id, evento_id, cargador, creada_en_local, dia_carga, datos, conceptos, monto, medio_pago, categoria)
           select gen_random_uuid(), 'congreso-prueba', 'Viejo', now(), current_date, '{\"nombre\":\"V\"}', '[]', 3750, 'efectivo', 'adultos' from generate_series(1,9)" >/dev/null
respaldo rec_v13 "$T/viejo.dump.gpg"
recuperar pruebas rec_destino "$T/viejo.dump.gpg" || mal "respaldo viejo"
[ "$(q rec_destino 'select count(*) from inscripciones')" = 9 ] && [ "$(q rec_destino 'select public.version_base()')" = "$(node -e "import('./herramientas/revision/revisar.mjs').then(m=>console.log(m.versionCodigo()))")" ] \
  && ok "respaldo de la versión 13: se recupera y queda al día" || mal "respaldo viejo"

for b in rec_origen rec_destino rec_real rec_v13; do psql $H -q -c "drop database if exists $b with (force)"; done
echo "OK: recuperación de respaldos"
