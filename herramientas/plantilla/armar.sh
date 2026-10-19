#!/usr/bin/env bash
# P12 · Arma la PLANTILLA pública a partir de este repositorio (el del caso testigo).
# Uso: herramientas/plantilla/armar.sh <carpeta-destino>   (la carpeta puede ser un clon del repo de la plantilla)
# Copia todo el código, SIN: datos del caso testigo, la conexión a su base, sus herramientas internas y este mismo workflow.
set -euo pipefail
ORIGEN="$(cd "$(dirname "$0")/../.." && pwd)"
DESTINO="${1:?Falta la carpeta destino}"
mkdir -p "$DESTINO"
rsync -a --delete \
  --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'dev-dist/' --exclude '.docs-tmp/' \
  --exclude 'herramientas/videos/' --exclude 'herramientas/manuales/' --exclude 'herramientas/generar_sql_eventos.mjs' \
  --exclude '.github/workflows/plantilla.yml' --exclude '.github/workflows/base-real-caso-testigo.yml' --exclude 'config/instalacion.json' \
  "$ORIGEN/" "$DESTINO/"

# Conexión: vacía hasta que se instale (la completa el botón «Instalar»).
cat > "$DESTINO/config/conexion.json" <<'JSON'
{
  "_ayuda": "Lo completa el botón «Instalar» (Actions → Instalar). Son datos públicos: nunca poner acá claves secretas.",
  "entorno": "sin-instalar",
  "url": "https://sin-instalar.supabase.co",
  "clavePublica": "sin-instalar"
}
JSON

# Identidad genérica (la de verdad se carga desde el panel → Institución).
node -e '
const fs = require("fs"); const f = process.argv[1];
const i = JSON.parse(fs.readFileSync(f, "utf8"));
i._ayuda = "Valores iniciales. El nombre lo completa el botón «Instalar»; el logo y los colores se cargan desde el panel (Institución).";
i.nombreInstitucion = "Institución";
fs.writeFileSync(f, JSON.stringify(i, null, 2) + "\n");
' "$DESTINO/config/institucion.json"

cp "$ORIGEN/herramientas/plantilla/LEEME-plantilla.md" "$DESTINO/README.md"
echo "Plantilla armada en $DESTINO"
