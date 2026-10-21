import { useCallback, useState } from 'react';
import Escaner from './Escaner.jsx';
import { activarAcceso, extraerCodigo, estaInstalada, MENSAJES_ACTIVACION } from '../datos/sesion.js';

function esIphone() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function esCelular() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

// Paso 1 (en el navegador): instalar la app. Paso 2 (desde el ícono): activar con el QR o el código.
export default function Activar({ codigoInicial = '', alActivar }) {
  const instalada = estaInstalada();
  const [enNavegador, setEnNavegador] = useState(false);
  const [codigo, setCodigo] = useState(extraerCodigo(codigoInicial));
  const [escaneando, setEscaneando] = useState(false);
  const [estado, setEstado] = useState(''); // '', 'activando'
  const [error, setError] = useState('');

  const activar = useCallback(async (texto) => {
    const c = extraerCodigo(texto);
    setCodigo(c);
    setEscaneando(false);
    setError('');
    setEstado('activando');
    const r = await activarAcceso(c);
    setEstado('');
    if (r.ok) alActivar(r.sesion);
    else setError(MENSAJES_ACTIVACION[r.error] || MENSAJES_ACTIVACION.datos_invalidos);
  }, [alActivar]);

  const alLeer = useCallback((texto) => activar(texto), [activar]);

  // En un celular, desde el navegador: primero instalar.
  if (!instalada && esCelular() && !enNavegador) {
    return (
      <main className="contenido">
        <h1>¡Bienvenido!</h1>
        <p>Para colaborar, primero <strong>instalá la app</strong> en tu celular. Es gratis y lleva un minuto.</p>
        <ol className="pasos-app">
          {esIphone() ? (
            <>
              <li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba).</li>
              <li>Elegí <strong>Agregar a inicio</strong> y tocá <strong>Agregar</strong>.</li>
            </>
          ) : (
            <>
              <li>Tocá el menú <strong>⋮</strong> (los tres puntitos de arriba a la derecha).</li>
              <li>Elegí <strong>Instalar aplicación</strong> (o «Agregar a la pantalla principal»). Si esas opciones no aparecen, elegí primero <strong>Abrir en Chrome</strong> y volvé a tocar ⋮.</li>
            </>
          )}
          <li>Cerrá el navegador y abrí la app desde el <strong>ícono nuevo</strong> de tu pantalla.</li>
          <li>Tocá <strong>Activar con QR</strong> y volvé a escanear el QR (o escribí el código).</li>
        </ol>
        {codigo && (
          <div className="codigo-grande" aria-label="Tu código">
            <small>Tu código (por si lo necesitás)</small>
            <strong>{codigo}</strong>
          </div>
        )}
        <button className="enlace" onClick={() => setEnNavegador(true)}>
          No puedo instalarla: usar en este navegador
        </button>
      </main>
    );
  }

  if (escaneando) {
    return (
      <main className="contenido">
        <h1>Escaneá el QR</h1>
        <Escaner alLeer={alLeer} alCancelar={() => setEscaneando(false)} />
      </main>
    );
  }

  const listo = extraerCodigo(codigo).length === 9;
  return (
    <main className="contenido">
      <h1>Activar mi acceso</h1>
      <p className="ayuda">Necesitás internet <strong>solo esta vez</strong>. Después la app funciona aunque no haya señal.</p>
      <button className="boton principal grande" onClick={() => { setError(''); setEscaneando(true); }} disabled={estado === 'activando'}>
        📷 Activar con QR
      </button>
      <p className="separador"><span>o escribí el código que está debajo del QR</span></p>
      <label className={`campo ${error ? 'con-error' : ''}`}>
        <span className="etiqueta">Código</span>
        <input
          id="codigo-acceso"
          value={codigo}
          onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setError(''); }}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Ej.: K7P4-M2QX"
          maxLength={12}
        />
      </label>
      {error && <div className="error-grande" role="alert">{error}</div>}
      <button className="boton secundario" disabled={!listo || estado === 'activando'} onClick={() => activar(codigo)}>
        {estado === 'activando' ? 'Activando…' : 'Activar con el código'}
      </button>
      <p className="ayuda"><a href="#ayuda">🛟 ¿Problemas? Mirá «¿Qué hago si…?»</a></p>
      <p className="ayuda">💻 ¿Sos del equipo que organiza (Responsable, Organizador, Tesorero o Consulta)? <a href="#panel" id="ir-al-panel">Entrar al panel</a></p>
    </main>
  );
}
