import { useCallback, useEffect, useState } from 'react';
import { rpc, mensajeError } from '../datos/panel.js';
import { formatoFechaHora } from '../logica/fechas.js';
import { evaluarEstado } from '../logica/estadoSistema.js';

// Etapa 9, punto 4 (D58): «Estado del sistema» (Responsable general).

export function useEstadoSistema(activo) {
  const [r, setR] = useState(null);
  const cargar = useCallback(async () => {
    if (!activo) return;
    setR(await rpc('panel_revision'));
  }, [activo]);
  useEffect(() => { cargar(); }, [cargar]);
  return { r, ...evaluarEstado(r), recargar: cargar };
}

const ICONO = { ok: '✅', aviso: '🟡', problema: '🔴' };

// Cartel para el Resumen: aparece solo si hay algo para mirar.
export function CartelEstado({ estado, alVer }) {
  // Antes de la primera revisión (recién instalado) no se insiste: eso ya lo recuerdan los Primeros pasos.
  if (!estado.r || !(estado.problemas || (estado.avisos && !estado.nunca))) return null;
  const partes = [];
  if (estado.problemas) partes.push(`${estado.problemas} ${estado.problemas === 1 ? 'problema' : 'problemas'}`);
  if (estado.avisos) partes.push(`${estado.avisos} ${estado.avisos === 1 ? 'aviso' : 'avisos'}`);
  return (
    <div className={estado.problemas ? 'error-grande' : 'advertencia'} role="status">
      {estado.problemas ? '🔴' : '🟡'} El sistema necesita atención: {partes.join(' y ')}.{' '}
      <button className="boton-chico" onClick={alVer}>Ver qué hacer</button>
    </div>
  );
}

export default function EstadoSistema({ estado }) {
  const [revisando, setRevisando] = useState(false);
  if (!estado.r) return <p>Cargando…</p>;
  if (!estado.r.ok) return <div className="error-grande">{mensajeError(estado.r)}</div>;
  const ultima = estado.r.ultima;
  const revisar = async () => { setRevisando(true); await estado.recargar(); setRevisando(false); };
  return (
    <section className="estado-sistema">
      <h2>Estado del sistema</h2>
      <p className="ayuda">
        Todos los días, a la mañana, el sistema se revisa solo: respaldo, bases de datos, llaves, correo y espacio.
        Si algo necesita atención, les manda un correo a los Responsables generales y lo muestra acá.
      </p>
      <div className={`resumen-estado ${estado.problemas ? 'mal' : estado.avisos ? 'regular' : 'bien'}`}>
        <strong>{estado.problemas ? `🔴 ${estado.problemas === 1 ? 'Hay un problema' : `Hay ${estado.problemas} problemas`} para resolver`
          : estado.avisos ? '🟡 Hay algo para revisar' : '✅ Todo en orden'}</strong>
        <small>{ultima ? `Última revisión: ${formatoFechaHora(ultima.cuando)}` : 'Todavía no hubo ninguna revisión.'}
          {ultima && ultima.correo ? ` · ${ultima.correo}` : ''}</small>
      </div>
      <ul className="lista-estado">
        {estado.items.map((x) => (
          <li key={x.id} className={`item-estado ${x.estado}`}>
            <span className="icono" aria-hidden="true">{ICONO[x.estado]}</span>
            <div>
              <strong>{x.titulo}</strong>
              {x.detalle && <p>{x.detalle}</p>}
              {x.queHacer && <p className="que-hacer"><b>Qué hacer:</b> {x.queHacer}</p>}
            </div>
          </li>
        ))}
      </ul>
      <button id="revisar-ahora" className="boton secundario" disabled={revisando} onClick={revisar}>{revisando ? 'Revisando…' : 'Revisar ahora'}</button>
      <p className="ayuda">«Revisar ahora» actualiza lo que el panel puede comprobar en el momento (versión y espacio de la base) y trae la última revisión.
        La revisión completa (respaldo, llaves y correo) la hace GitHub: para hacerla ya, GitHub → «Actions» → «Revisión diaria» → «Run workflow».</p>
    </section>
  );
}
