import { useCallback, useEffect, useState } from 'react';

const leerAjuste = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardarAjuste = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

// D69 · Asistente de práctica: un recuadro arriba del panel que dice en qué paso está la práctica,
// qué hacer y lleva a la pantalla justa. Se actualiza solo (la inscripción y el presente se hacen desde un celular).

const CADA_MS = 15000;

// Estado de los QR de cargador de MIS prácticas que siguen abiertos: ¿alguno sin activar? ¿alguno activado?
export function estadoQRPractica(datosQR, correo) {
  if (!datosQR || !datosQR.ok) return { sinActivar: [], activado: false };
  const yo = String(correo || '').toLowerCase();
  const practicas = new Set((datosQR.eventos || []).filter((e) => e.practica).map((e) => e.id));
  const ahora = new Date(datosQR.ahora || Date.now()).getTime();
  const mios = (datosQR.accesos || []).filter((a) => practicas.has(a.eventoId) && !a.cerradoEn
    && new Date(a.hasta).getTime() > ahora && String(a.creadoPor || '').toLowerCase() === yo);
  return {
    sinActivar: mios.filter((a) => !a.dispositivos).map((a) => a.id),
    activado: mios.some((a) => a.dispositivos > 0),
  };
}

// Qué paso le toca a cada rol, en palabras simples. Devuelve null si no hay nada que mostrar.
export function pasoPractica({ rol, pasos, hayPractica, puedeOrganizar, qr }) {
  if (rol === 'tesorero') {
    if (pasos.rendicion) return null;
    if (!hayPractica && !puedeOrganizar) {
      return { n: 1, total: 1, titulo: 'Registrar una entrega en el evento de práctica',
        texto: 'Todavía no hay un evento de práctica abierto. Pedile al Organizador que cree uno («Crear eventos» → «Crear evento de práctica»).' };
    }
    return { n: 1, total: 1, titulo: 'Registrar una entrega en el evento de práctica', accion: 'rendiciones', boton: 'Ir a Rendiciones de la práctica',
      texto: 'En «Rendiciones», tocá «Registrar entrega» en la fila de un cargador y anotá el efectivo. Si no aparece ningún cargador, primero hay que cargar en la práctica una inscripción pagada en efectivo.' };
  }
  if (!pasos.crear) {
    return { n: 1, total: 3, titulo: 'Crear el evento de práctica', accion: 'crear', boton: 'Crear evento de práctica',
      texto: 'Es un evento de mentira, igual a uno real. Se crea con un toque y se borra solo al terminar la semana.' };
  }
  if (!pasos.qr) {
    return { n: 2, total: 3, titulo: 'Crear un QR de cargador para la práctica', accion: 'qr', boton: 'Crear el QR',
      texto: 'Escribí tu nombre y tocá «Crear QR». Tené el celular a mano: el código del QR se muestra una sola vez.' };
  }
  const titulo = 'Cargar una inscripción desde un celular y marcar el presente';
  const final = 'Al cargarla, tildá «Ya está presente» (o, si no aparece esa casilla, usá un QR de control de presentes).';
  if (!pasos.inscripcion) {
    if (qr.activado) {
      return { n: 3, total: 3, titulo, texto: `El QR ya está activado en un celular. Ahora, en ese celular, tocá «+ Nueva inscripción» y cargá una persona de mentira. ${final}`, espera: true };
    }
    return { n: 3, total: 3, titulo,
      texto: `Escaneá el QR con la cámara del celular, abrí la app desde el ícono nuevo y tocá «Activar con QR». Después cargá una inscripción de mentira. ${final}`,
      ...(qr.sinActivar.length > 0 ? {
        olvido: 'Si ya cerraste la pantalla del QR, el código no se puede volver a ver (por seguridad). Creá otro: el anterior se cierra solo.',
        accion: 'otroQR', boton: 'Crear otro QR',
      } : { accion: 'qr', boton: 'Crear un QR de cargador' }),
      espera: true };
  }
  if (!pasos.presente) {
    return { n: 3, total: 3, titulo: 'Marcar un presente', accion: 'qrPresentes', boton: 'Crear un QR de control de presentes', espera: true,
      texto: 'La inscripción ya llegó ✅. Falta marcar un presente: cargá otra inscripción tildando «Ya está presente», o creá un QR de control de presentes, activalo en un celular y tocá «Presente» en alguien.' };
  }
  return null;
}

export function GuiaPractica({ yo, tiene, practica, hayPractica, alAccion, datosQR }) {
  const d = practica.datos;
  const clave = `practicaTerminadaVista:${String(yo.email || '').toLowerCase()}`;
  const [festejoVisto, setFestejoVisto] = useState(() => !!leerAjuste(clave));
  const [ocupado, setOcupado] = useState(false);
  const [qr, setQr] = useState({ sinActivar: [], activado: false });
  const esOrg = tiene('organizador');
  const esTes = tiene('tesorero');
  const orgFalta = esOrg && d && !d.organizadorHecha;
  const tesFalta = esTes && d && !d.tesoreroHecha;
  const recargarPractica = practica.recargar;

  const actualizar = useCallback(async () => {
    await recargarPractica();
    if (esOrg && datosQR) setQr(estadoQRPractica(await datosQR(), yo.email));
  }, [recargarPractica, esOrg, datosQR, yo.email]);

  useEffect(() => {
    if (!orgFalta && !tesFalta) return undefined;
    actualizar();
    const t = setInterval(actualizar, CADA_MS);
    return () => clearInterval(t);
  }, [orgFalta, tesFalta, actualizar]);

  if (!d || (!esOrg && !esTes)) return null;
  const pasos = d.pasos || {};

  if (!orgFalta && !tesFalta) {
    // Recién terminada: se festeja una vez. Quien no empezó ningún paso (ni tiene rol con práctica) no ve nada.
    // Solo si la terminó hace poco (2 días): a quien practicó hace mucho no se le festeja de golpe.
    const ultima = Math.max(0, ...Object.values(pasos).map((v) => new Date(v).getTime() || 0));
    const reciente = ultima > 0 && Date.now() - ultima < 2 * 24 * 3600 * 1000;
    if (festejoVisto || !reciente) return null;
    return (
      <div className="guia-practica terminada" role="status" id="guia-practica">
        <p>🎉 <strong>Práctica terminada.</strong> Ya podés {esOrg ? 'crear eventos reales y generar sus QR' : 'registrar las rendiciones de los eventos reales'}. El evento de práctica se borra solo al terminar la semana; mientras tanto podés usarlo para capacitar a los voluntarios.</p>
        <button id="cerrar-guia-practica" className="boton-chico" onClick={() => { guardarAjuste(clave, '1'); setFestejoVisto(true); }}>Cerrar</button>
      </div>
    );
  }

  const rol = orgFalta ? 'organizador' : 'tesorero';
  const p = pasoPractica({ rol, pasos, hayPractica, puedeOrganizar: esOrg, qr });
  if (!p) return null;
  const accionar = async () => {
    setOcupado(true);
    try { await alAccion(p.accion, qr); window.scrollTo(0, 0); await actualizar(); } finally { setOcupado(false); }
  };
  return (
    <div className="guia-practica" role="region" aria-label="Asistente de práctica" id="guia-practica">
      <p className="guia-practica-titulo">🧪 <strong>Tu práctica de {rol === 'tesorero' ? 'Tesorero' : 'Organizador'}</strong> · Paso {p.n} de {p.total}</p>
      <div className="guia-practica-barra" aria-hidden="true">{Array.from({ length: p.total }, (_, k) => <span key={k} className={k < p.n - 1 ? 'hecho' : k === p.n - 1 ? 'actual' : ''} />)}</div>
      <p className="guia-practica-paso"><strong>{p.titulo}</strong></p>
      <p>{p.texto}</p>
      {p.olvido && <p className="guia-practica-olvido">⚠️ {p.olvido}</p>}
      <div className="guia-practica-botones">
        {p.accion && <button id="guia-practica-accion" className="boton principal" disabled={ocupado} onClick={accionar}>{ocupado ? 'Un momento…' : p.boton}</button>}
        {p.espera && <small className="ayuda">Este recuadro se actualiza solo cuando llega lo del celular.</small>}
      </div>
    </div>
  );
}
