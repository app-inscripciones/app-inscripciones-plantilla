import { useState } from 'react';
import { dejarAcceso } from '../datos/sesion.js';
import { etiquetaEvento, formatoHorario } from '../logica/fechas.js';

// D64 · En el celular: dejar el acceso actual (salir) o cambiarlo por otro QR, sin perder nada.

const MARCAS_PENDIENTES = 'Todavía hay presentes marcados en este celular que no se enviaron. Conectate a internet y esperá a que se envíen (arriba dice cuántos faltan); después vas a poder dejar el acceso.';

function quienSoy(sesion) {
  return `${sesion.tarea === 'cargar' ? 'cargador' : 'control de presentes'} de «${etiquetaEvento(sesion.evento)}»`;
}

// Botón al pie de la pantalla del cargador o de la puerta.
export function BotonDejarAcceso({ sesion, sinEnviar = 0, alDejar }) {
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const dejar = async () => {
    setOcupado(true); setError('');
    const r = await dejarAcceso();
    setOcupado(false);
    if (!r.ok) { setError(MARCAS_PENDIENTES); return; }
    alDejar();
  };
  if (!confirmar) {
    return (
      <div className="dejar-acceso">
        <button id="dejar-acceso" className="enlace" onClick={() => setConfirmar(true)}>Dejar este acceso…</button>
      </div>
    );
  }
  return (
    <div className="dejar-acceso panel-form" role="dialog" aria-label="Dejar este acceso">
      <p><strong>¿Dejar de ser {quienSoy(sesion)}?</strong></p>
      <p>El celular vuelve a la pantalla para activar un QR.{sesion.tarea === 'cargar' && sinEnviar > 0
        ? <> Las <strong>{sinEnviar}</strong> inscripciones que faltan enviar <strong>no se pierden</strong>: quedan guardadas y se envían solas cuando haya internet. No borres la app.</>
        : ' No se pierde nada.'}</p>
      <p className="ayuda">Si lo dejás por error, volvé a escanear el mismo QR en este celular y seguís donde estabas (mientras esté en horario).</p>
      {error && <div className="error-grande" role="alert">{error}</div>}
      <div className="botones-barra">
        <button className="boton secundario" onClick={() => { setConfirmar(false); setError(''); }} disabled={ocupado}>No, seguir</button>
        <button id="confirmar-dejar-acceso" className="boton principal" onClick={dejar} disabled={ocupado}>Sí, dejar este acceso</button>
      </div>
    </div>
  );
}

// Pantalla cuando el celular ya tiene un acceso y se escanea otro QR.
export function CambiarAcceso({ sesion, sinEnviar = 0, alSeguir, alCambiar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cambiar = async () => {
    setOcupado(true); setError('');
    const r = await dejarAcceso();
    setOcupado(false);
    if (!r.ok) { setError(MARCAS_PENDIENTES); return; }
    alCambiar();
  };
  return (
    <main className="contenido angosto">
      <h2>Escaneaste otro QR</h2>
      <div className="advertencia" role="status">
        Este celular ya está activado como <strong>{quienSoy(sesion)}</strong>, {formatoHorario(sesion.desde, sesion.hasta)}.
      </div>
      <p>¿Qué querés hacer?</p>
      {sesion.tarea === 'cargar' && sinEnviar > 0 && (
        <p className="ayuda">Si cambiás, las <strong>{sinEnviar}</strong> inscripciones que faltan enviar no se pierden: se envían solas cuando haya internet.</p>
      )}
      {error && <div className="error-grande" role="alert">{error}</div>}
      <div className="botones-columna">
        <button id="activar-nuevo-qr" className="boton principal grande" onClick={cambiar} disabled={ocupado}>Dejar el actual y activar el nuevo QR</button>
        <button id="seguir-acceso-actual" className="boton secundario grande" onClick={alSeguir} disabled={ocupado}>Seguir con el acceso actual</button>
      </div>
    </main>
  );
}

// D66 · La primera vez que un celular activa un QR real: un aviso corto (sin práctica obligatoria).
export function AvisoPrimeraVez({ alCerrar }) {
  return (
    <div className="aviso-primera-vez" role="note">
      👋 <strong>¡Bienvenido/a!</strong> Si tenés alguna duda, consultá a la persona que te dio el QR. En cada pantalla tenés la ayuda en <strong>«¿Cómo se usa esta pantalla?»</strong>.
      <button id="entendido-primera-vez" className="boton-chico" onClick={alCerrar}>Entendido</button>
    </div>
  );
}
