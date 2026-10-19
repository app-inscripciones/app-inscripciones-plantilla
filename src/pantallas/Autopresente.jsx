import { useEffect, useState } from 'react';
import Marca from './Marca.jsx';
import { llamarFuncion } from '../datos/sincronizacion.js';
import { formatoFechaHora } from '../logica/fechas.js';
import { MENSAJES_AUTOPRESENTE } from '../datos/mensajes.js';

// Autopresente con QR (R20, D62): página que abre el participante al escanear el QR de la entrada.
// No hace falta instalar nada ni iniciar sesión. Escribe su DNI o teléfono, confirma su nombre
// (parcialmente oculto) y queda presente. Nunca ve datos de otras personas.

const mensaje = (r) => MENSAJES_AUTOPRESENTE[(r && r.error) || 'sin_conexion'] || MENSAJES_AUTOPRESENTE.datos_invalidos;

// Identificador al azar de este celular (para el límite de intentos). Si el navegador no deja guardar, uno nuevo.
function idDispositivo() {
  try {
    let id = window.localStorage.getItem('autopresente-dispositivo');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      window.localStorage.setItem('autopresente-dispositivo', id);
    }
    return id;
  } catch {
    return String(Math.random()).slice(2);
  }
}

async function llamar(nombre, cuerpo) {
  try {
    return await llamarFuncion(nombre, cuerpo);
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
}

export default function Autopresente({ codigo }) {
  const [estado, setEstado] = useState(null);
  const [dato, setDato] = useState('');
  const [opciones, setOpciones] = useState(null);
  const [elegidas, setElegidas] = useState([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => { llamar('autopresente_estado', { p_codigo: codigo }).then(setEstado); }, [codigo]);

  const buscar = async (e) => {
    e.preventDefault();
    setError(''); setOcupado(true);
    const r = await llamar('autopresente_buscar', { p_codigo: codigo, p_dato: dato, p_dispositivo: idDispositivo() });
    setOcupado(false);
    if (!r.ok) { setError(mensaje(r)); return; }
    setOpciones(r.opciones);
    setElegidas(r.opciones.filter((o) => !o.yaPresente).map((o) => o.opcion));
  };

  const confirmar = async () => {
    setError(''); setOcupado(true);
    const r = await llamar('autopresente_marcar', { p_codigo: codigo, p_dato: dato, p_opciones: elegidas });
    setOcupado(false);
    if (!r.ok) { setError(mensaje(r)); return; }
    setListo({ nombres: opciones.filter((o) => elegidas.includes(o.opcion)).map((o) => o.nombre), hora: r.hora });
  };

  const volver = () => { setOpciones(null); setElegidas([]); setDato(''); setError(''); setListo(null); };

  let cuerpo;
  if (!estado) cuerpo = <p>Cargando…</p>;
  else if (!estado.ok) {
    cuerpo = (
      <>
        {estado.evento && <h2>{estado.evento}</h2>}
        <div className="error-grande" role="alert">{mensaje(estado)}</div>
      </>
    );
  } else if (listo) {
    cuerpo = (
      <div className="autopresente-listo" role="status">
        <div className="tilde">✓</div>
        <h2>¡Listo! Quedaste presente</h2>
        <p><strong>{listo.nombres.join(', ')}</strong> · {estado.momento} · {formatoFechaHora(listo.hora).split(' ')[1]}</p>
        <p className="ayuda">Ya podés guardar el celular. No hace falta pasar por la puerta.</p>
        <button className="boton secundario" onClick={volver}>Marcar a otra persona</button>
      </div>
    );
  } else if (opciones) {
    const todosYa = opciones.every((o) => o.yaPresente);
    cuerpo = (
      <>
        <h2>{opciones.length === 1 ? `¿Sos ${opciones[0].nombre}?` : '¿Quiénes llegaron?'}</h2>
        {opciones.length > 1 && <p className="ayuda">Tocá a las personas que están acá ahora.</p>}
        <ul className="opciones-autopresente">
          {opciones.map((o) => (
            <li key={o.opcion}>
              {o.yaPresente ? (
                <span className="estado-puerta verde">✓ {o.nombre} · ya estaba presente</span>
              ) : opciones.length > 1 ? (
                <label className="rol-opcion">
                  <input type="checkbox" checked={elegidas.includes(o.opcion)}
                    onChange={(e) => setElegidas(e.target.checked ? [...elegidas, o.opcion] : elegidas.filter((x) => x !== o.opcion))} />
                  <span><strong>{o.nombre}</strong></span>
                </label>
              ) : null}
            </li>
          ))}
        </ul>
        {error && <div className="error-grande" role="alert">{error}</div>}
        {todosYa ? <div className="exito">Ya estabas presente. No hace falta hacer nada más.</div> : (
          <button className="boton principal grande" id="confirmar-presente" disabled={ocupado || elegidas.length === 0} onClick={confirmar}>
            {ocupado ? 'Marcando…' : opciones.length === 1 ? 'Sí, estoy presente' : `Marcar presentes (${elegidas.length})`}
          </button>
        )}
        <button className="boton secundario" onClick={volver}>{opciones.length === 1 ? 'No soy yo' : 'Volver'}</button>
      </>
    );
  } else {
    cuerpo = (
      <form onSubmit={buscar}>
        <h2>Marcá tu presente</h2>
        <p className="ayuda">{estado.evento} · <strong>{estado.momento}</strong></p>
        {estado.practica && <div className="aviso-practica">🧪 PRÁCTICA: no es real.</div>}
        <label className="campo">
          <span className="etiqueta">Tu DNI o tu teléfono (solo números)</span>
          <input id="dato-autopresente" inputMode="numeric" autoComplete="off" value={dato} autoFocus
            onChange={(e) => { setDato(e.target.value.replace(/[^\d]/g, '').slice(0, 15)); setError(''); }} placeholder="Ej.: 30111222" />
        </label>
        {error && <div className="error-grande" role="alert">{error}</div>}
        <button className="boton principal grande" type="submit" disabled={ocupado || dato.length < 6}>{ocupado ? 'Buscando…' : 'Buscar'}</button>
        <p className="ayuda">🔒 Solo se muestra tu nombre, en forma parcial. Si no tenés internet o no aparecés, acercate a la puerta.</p>
      </form>
    );
  }

  return (
    <>
      <header className="encabezado"><Marca titulo="Presente" /></header>
      <main className="contenido autopresente">{cuerpo}</main>
    </>
  );
}
