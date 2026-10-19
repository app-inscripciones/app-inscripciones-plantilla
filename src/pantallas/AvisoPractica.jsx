import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { rpc } from '../datos/panel.js';

// D66 · Practicar antes de hacerlo de verdad. La base anota sola los pasos de práctica de cada persona;
// mientras falten, el panel avisa (sin bloquear) antes de crear eventos, abrirlos, crear QR o registrar rendiciones.

export const PASOS_PRACTICA = {
  organizador: [
    ['crear', 'Crear el evento de práctica («Crear eventos» → «Crear evento de práctica»)'],
    ['qr', 'Crear un QR de cargador para la práctica'],
    ['inscripcion', 'Activarlo en un celular y cargar una inscripción'],
    ['presente', 'Marcar un presente (QR de control de presentes o «Ya está presente»)'],
  ],
  tesorero: [
    ['rendicion', 'Registrar una entrega (rendición) en el evento de práctica'],
  ],
};

const PracticaContexto = createContext(null);

export function usePractica(activo) {
  const [datos, setDatos] = useState(null);
  const recargar = useCallback(async () => {
    if (!activo) return;
    const r = await rpc('panel_mi_practica');
    if (r && r.ok) setDatos(r);
  }, [activo]);
  useEffect(() => { recargar(); }, [recargar]);
  return { datos, recargar };
}

export function ProveedorPractica({ valor, children }) {
  return <PracticaContexto.Provider value={valor}>{children}</PracticaContexto.Provider>;
}

// { hecha, pasos, falta } para un rol. Si todavía no se sabe (cargando o sin base nueva), se considera hecha: no molesta.
export function usePracticaDe(rol) {
  const ctx = useContext(PracticaContexto);
  const d = ctx && ctx.datos;
  if (!d) return { hecha: true, pasos: {}, conocida: false, recargar: ctx ? ctx.recargar : () => {}, practicar: null };
  const hecha = rol === 'tesorero' ? !!d.tesoreroHecha : !!d.organizadorHecha;
  const puede = rol === 'tesorero' ? ctx.hayPractica || ctx.puedeOrganizar : ctx.puedeOrganizar;
  return { hecha, pasos: d.pasos || {}, conocida: true, recargar: ctx.recargar, practicar: puede ? () => ctx.practicar(rol) : null };
}

export function ListaPractica({ rol, pasos }) {
  return (
    <ol className="lista-practica">
      {PASOS_PRACTICA[rol].map(([id, texto]) => (
        <li key={id} className={pasos[id] ? 'hecho' : ''}><span aria-hidden="true">{pasos[id] ? '✅' : '⬜'}</span> {texto}</li>
      ))}
    </ol>
  );
}

// Aviso dentro de una pantalla. «accion»: qué está por hacer («crear un evento real»).
// Con alSeguir, es un aviso que corta el paso: muestra «Seguir igual».
export function AvisoPractica({ rol = 'organizador', accion, alSeguir, alCancelar }) {
  const p = usePracticaDe(rol);
  const [creando, setCreando] = useState(false);
  if (p.hecha) return null;
  const nombreRol = rol === 'tesorero' ? 'Tesorero' : 'Organizador';
  return (
    <div className="aviso-practica-previa" role="alert">
      <p>🧪 <strong>Todavía no hiciste la práctica de {nombreRol}.</strong> Antes de {accion}, conviene practicar con un evento de mentira: lleva unos 10 minutos y evita errores en un evento real (la práctica se borra sola a la semana).</p>
      <ListaPractica rol={rol} pasos={p.pasos} />
      {rol === 'tesorero' && !p.practicar && <p className="ayuda">Si no hay un evento de práctica abierto, pedile al Organizador que cree uno.</p>}
      <div className="botones-barra">
        {p.practicar && (
          <button id="practicar-ahora" className="boton principal" disabled={creando}
            onClick={async () => { setCreando(true); await p.practicar(); setCreando(false); }}>
            {creando ? 'Creando la práctica…' : rol === 'tesorero' ? 'Ir al evento de práctica' : 'Practicar ahora'}
          </button>
        )}
        {alCancelar && <button className="boton secundario" onClick={alCancelar}>Cancelar</button>}
        {alSeguir && <button id="seguir-sin-practica" className="boton secundario" onClick={alSeguir}>Seguir igual</button>}
      </div>
    </div>
  );
}
