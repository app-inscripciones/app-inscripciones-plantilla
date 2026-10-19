import { useEffect, useState } from 'react';
import base from '../../config/institucion.json';
import { llamarFuncion } from './sincronizacion.js';

// Datos de la institución (D35): se cargan desde el panel (Responsable general) y se guardan en la base.
// `config/institucion.json` queda solo como valor inicial. El celular guarda una copia para usarla sin internet.

const CLAVE = 'institucion';
const inicial = {
  configurada: false,
  nombre: base.nombreInstitucion,
  nombreApp: base.nombreApp,
  colorPrincipal: base.colores.principal,
  colorFondo: base.colores.fondo,
  logo: null,
  avisoSalud: base.avisoDatosSalud,
  contacto: null,
};

function leerGuardada() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? { ...inicial, ...JSON.parse(t) } : inicial;
  } catch {
    return inicial;
  }
}

let actual = leerGuardada();
const oyentes = new Set();

export function aplicar(inst) {
  try {
    document.documentElement.style.setProperty('--principal', inst.colorPrincipal);
    document.documentElement.style.setProperty('--fondo', inst.colorFondo);
    document.title = inst.nombreApp;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', inst.colorPrincipal);
  } catch {
    /* fuera del navegador */
  }
}

export function institucionActual() {
  return actual;
}

export function fijarInstitucion(datos) {
  actual = { ...inicial, ...datos, avisoSalud: datos.avisoSalud || inicial.avisoSalud };
  try { localStorage.setItem(CLAVE, JSON.stringify(actual)); } catch { /* sin almacenamiento */ }
  aplicar(actual);
  oyentes.forEach((f) => f(actual));
}

// Trae los datos de la base (si hay internet). Si todavía no se configuró, sigue con los valores iniciales.
export async function actualizarInstitucion(fetchFn = fetch) {
  try {
    const r = await llamarFuncion('institucion_publica', {}, fetchFn);
    if (r && r.configurada) fijarInstitucion(r);
    return r;
  } catch {
    return null;
  }
}

export function useInstitucion() {
  const [inst, setInst] = useState(actual);
  useEffect(() => {
    oyentes.add(setInst);
    return () => oyentes.delete(setInst);
  }, []);
  return inst;
}

// Achica una imagen elegida por el usuario a un logo cuadrado (máx. 256 px) en PNG.
export function prepararLogo(archivo, lado = 256) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen.'));
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}
