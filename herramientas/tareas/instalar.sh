#!/usr/bin/env bash
# Tarea «Instalar» (D34): crea las bases, carga las tablas, configura el correo, guarda la configuración y publica la app.
# Datos que se escriben en «Run workflow»: NOMBRE_INSTITUCION, CORREO_PROYECTO, CORREO_RESPONSABLE, NOMBRE_RESPONSABLE.
set -euo pipefail
source "$TAREAS/comun.sh"
echo "::group::Crear las bases, cargar las tablas y configurar el correo"
node herramientas/instalador/instalar.mjs
echo "::endgroup::"
echo "::group::Guardar la configuración en el repositorio"
git add config/conexion.json config/institucion.json config/instalacion.json
AUTOR_GIT=Instalador subir_cambios "Instalación: configuración de ${NOMBRE_INSTITUCION:-la institución}"
echo "::endgroup::"
echo "::group::Preparar la app"
preparar_app
echo "::endgroup::"
echo "::group::Publicar en Cloudflare Pages"
publicar_app
echo "::endgroup::"
