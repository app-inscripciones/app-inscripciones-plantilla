#!/usr/bin/env bash
# Tarea «Despertar la base» (D74): si el plan gratuito pausó una base, la despierta; y evita que GitHub apague
# las tareas programadas de un repositorio sin cambios (las vuelve a habilitar y anota la fecha una vez por mes).
set -uo pipefail
source "$TAREAS/comun.sh"
echo "::group::Despertar las bases si están pausadas"
node herramientas/instalador/despertar.mjs; ESTADO=$?
echo "::endgroup::"
echo "::group::Que GitHub no apague las tareas automáticas"
for t in respaldo-diario.yml revision-diaria.yml despertar-base.yml; do
  [ -f ".github/workflows/$t" ] && gh api -X PUT "repos/$GITHUB_REPOSITORY/actions/workflows/$t/enable" >/dev/null 2>&1 || true
done
if [ $(( ($(date +%s) - $(git log -1 --format=%ct)) / 86400 )) -ge 30 ]; then
  date -u +%Y-%m-%d > .github/actividad.txt
  git add .github/actividad.txt
  subir_cambios "Actividad mensual (para que GitHub no apague las tareas automáticas)" || true
fi
echo "::endgroup::"
exit $ESTADO
