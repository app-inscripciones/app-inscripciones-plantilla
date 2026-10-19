import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { Firma } from './pantallas/Firma.jsx';
import { aplicar, institucionActual, actualizarInstitucion } from './datos/institucion.js';
import './estilos.css';

// Activa el funcionamiento sin conexión (service worker).
registerSW({ immediate: true });

// Nombre y colores de la institución (los últimos conocidos; se actualizan solos si hay internet).
aplicar(institucionActual());
actualizarInstitucion();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Firma />
  </StrictMode>
);
