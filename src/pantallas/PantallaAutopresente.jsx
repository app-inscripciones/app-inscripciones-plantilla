import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Marca from './Marca.jsx';
import { llamarFuncion } from '../datos/sincronizacion.js';
import { formatoHorario } from '../logica/fechas.js';

// Autopresente con QR en pantalla (D62): el Organizador abre esta página en un celular, tablet o TV con internet,
// en la entrada. Muestra un QR que cambia cada 30 segundos, para que nadie se marque con una foto vieja.
// Esta dirección es secreta (no se muestra al público): el público solo ve el QR.

export const enlaceAutopresente = (codigo) => `${window.location.origin}/#autopresente/${codigo}`;

export default function PantallaAutopresente({ pantalla }) {
  const [d, setD] = useState(null);
  const [imagen, setImagen] = useState('');
  const [sinConexion, setSinConexion] = useState(false);
  const ultimo = useRef('');

  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      try {
        const r = await llamarFuncion('autopresente_pantalla', { p_pantalla: pantalla });
        if (!vivo) return;
        setSinConexion(false);
        setD(r);
        if (r.ok && r.codigo && r.codigo !== ultimo.current) {
          ultimo.current = r.codigo;
          setImagen(await QRCode.toDataURL(enlaceAutopresente(r.codigo), { width: 900, margin: 1, errorCorrectionLevel: 'M' }));
        } else if (r.ok && !r.codigo) { ultimo.current = ''; setImagen(''); }
      } catch {
        if (vivo) setSinConexion(true);
      }
    };
    traer();
    const t = setInterval(traer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [pantalla]);

  let cuerpo;
  if (!d) cuerpo = <p>{sinConexion ? 'Esta pantalla necesita internet para mostrar el QR.' : 'Cargando…'}</p>;
  else if (!d.ok) cuerpo = <div className="error-grande">Esta dirección no es válida. Volvé a abrirla desde el panel («QR de colaboradores»).</div>;
  else if (d.cerradoEn) cuerpo = <div className="error-grande">Este QR se cerró. Si hace falta, creá otro desde el panel.</div>;
  else if (!d.codigo) cuerpo = <div className="advertencia">Fuera de horario: el QR se muestra {formatoHorario(d.desde, d.hasta)}.</div>;
  else {
    cuerpo = (
      <>
        <h1 className="pantalla-titulo">📱 Marcá tu presente</h1>
        <p className="pantalla-sub">Escaneá este código con la cámara de tu celular</p>
        {imagen && <img className="pantalla-qr" src={imagen} alt="Código QR para marcar el presente" />}
        <p className="pantalla-sub"><strong>{d.evento}</strong> · {d.momento}</p>
        <p className="ayuda">El código cambia cada 30 segundos. {sinConexion ? '⚠️ Sin internet: el código puede no estar al día.' : ''}</p>
      </>
    );
  }
  return (
    <>
      <header className="encabezado"><Marca titulo="Presentes" /></header>
      <main className="contenido pantalla-autopresente">{cuerpo}</main>
    </>
  );
}
