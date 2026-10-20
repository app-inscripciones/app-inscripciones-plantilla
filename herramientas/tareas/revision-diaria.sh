#!/usr/bin/env bash
# Tarea «Revisión diaria» (D58): revisa respaldo, bases, llaves, correo y espacio; guarda el resultado para el panel
# («Estado del sistema») y, si algo necesita atención, manda un correo en castellano a los Responsables generales.
set -euo pipefail
source "$TAREAS/comun.sh"
if ! instalado; then resumen "Todavía no se tocó el botón «Instalar»: no hay nada que hacer."; exit 0; fi
node herramientas/instalador/despertar.mjs || echo "::warning::No se pudo revisar si las bases estaban pausadas."
command -v psql > /dev/null || (sudo apt-get update -q && sudo apt-get install -y -q postgresql-client)
# Si no hay conexión, la revisión igual corre: avisa que no pudo conectarse.
URL=$(url_base real || true)
ocultar "$URL"
export URL_BASE="${URL:-postgresql://sin-conexion}"
node herramientas/revision/revisar.mjs
