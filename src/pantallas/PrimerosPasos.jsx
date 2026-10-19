import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../datos/panel.js';
import { evaluarPrimerosPasos } from '../logica/primerosPasos.js';

// Etapa 9 (R17): lista de «Primeros pasos» para el Responsable general.
// Lo que la app puede comprobar se marca solo. Lo demás, con «Ya lo hice» (se recuerda en esta computadora).

const CLAVE = 'primeros-pasos';
function leerGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; }
}
function guardar(v) {
  try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento: no pasa nada */ }
}

export function usePrimerosPasos({ activo, institucionConfigurada, eventos, respaldoOk = false, practicaHecha = false }) {
  const [guardado, setGuardado] = useState(leerGuardado);
  const [usuarios, setUsuarios] = useState([]);
  const cargar = useCallback(async () => {
    if (!activo) return;
    const u = await rpc('panel_usuarios');
    if (u && u.ok) setUsuarios(u.usuarios);
  }, [activo]);
  useEffect(() => { cargar(); }, [cargar]);

  const evaluacion = evaluarPrimerosPasos({
    institucionConfigurada, usuarios, eventos, practicaHecha, respaldoOk, hechosAMano: guardado.hechos || {},
  });
  const cambiar = (v) => { const n = { ...guardado, ...v }; setGuardado(n); guardar(n); };
  return {
    ...evaluacion,
    oculta: !!guardado.oculta,
    ocultar: () => cambiar({ oculta: true }),
    mostrar: () => cambiar({ oculta: false }),
    marcar: (id, valor) => cambiar({ hechos: { ...(guardado.hechos || {}), [id]: valor } }),
    recargar: cargar,
  };
}

export default function PrimerosPasos({ pp, irA, tieneRol }) {
  const [abierto, setAbierto] = useState(null);
  if (pp.oculta) return null;
  const abiertoId = abierto ?? pp.siguiente;

  if (pp.completo) {
    return (
      <div className="exito primeros-listo">
        ✅ <strong>Primeros pasos completos.</strong> El sistema está listo para usarse.{' '}
        <button className="boton-chico" onClick={pp.ocultar}>Ocultar</button>
      </div>
    );
  }

  return (
    <section className="primeros-pasos" aria-label="Primeros pasos">
      <div className="primeros-cabecera">
        <div>
          <h2>Primeros pasos</h2>
          <p className="ayuda">Lo que hay que hacer para dejar el sistema listo. Llevás <strong>{pp.hechos} de {pp.total}</strong>.</p>
        </div>
        <button className="enlace" onClick={pp.ocultar}>Ocultar esta lista</button>
      </div>
      <div className="barra-progreso" aria-hidden="true"><span style={{ width: `${(100 * pp.hechos) / pp.total}%` }} /></div>
      <ol className="lista-pasos">
        {pp.pasos.map((p, k) => {
          const desplegado = abiertoId === p.id;
          const puedeIr = p.ir && (!p.requiere || tieneRol(p.requiere));
          return (
            <li key={p.id} className={`paso-inicial ${p.hecho ? 'hecho' : ''} ${p.id === pp.siguiente ? 'siguiente' : ''}`}>
              <button className="paso-titulo" aria-expanded={desplegado} onClick={() => setAbierto(desplegado ? '' : p.id)}>
                <span className="paso-marca" aria-hidden="true">{p.hecho ? '✓' : k + 1}</span>
                <span>{p.titulo}{p.hecho && <small> · hecho</small>}</span>
              </button>
              {desplegado && (
                <div className="paso-cuerpo">
                  <p>{p.explica}</p>
                  {!puedeIr && p.ir && !p.hecho && (
                    <p className="ayuda">Esto lo hace alguien con el rol Organizador. Si sos vos, agregate ese rol en «Personas y roles».</p>
                  )}
                  <div className="botones-fila">
                    {puedeIr && !p.hecho && <button className="boton principal" onClick={() => irA(p.ir)}>{p.boton}</button>}
                    {p.manual && (
                      <button className={`boton ${p.hecho ? 'secundario' : 'principal'}`} onClick={() => pp.marcar(p.id, !p.hecho)}>
                        {p.hecho ? 'Desmarcar' : 'Ya lo hice'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
