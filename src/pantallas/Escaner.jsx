import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Lector de QR con la cámara del celular (funciona en Android y iPhone).
export default function Escaner({ alLeer, alCancelar }) {
  const video = useRef(null);
  const lienzo = useRef(null);
  const [falla, setFalla] = useState('');

  useEffect(() => {
    let flujo = null;
    let cuadro = 0;
    let terminado = false;

    const leer = () => {
      if (terminado) return;
      const v = video.current;
      const c = lienzo.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const codigo = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (codigo && codigo.data) {
          terminado = true;
          if (navigator.vibrate) navigator.vibrate(80);
          alLeer(codigo.data);
          return;
        }
      }
      cuadro = requestAnimationFrame(leer);
    };

    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (terminado) return;
        video.current.srcObject = flujo;
        video.current.setAttribute('playsinline', 'true');
        await video.current.play();
        cuadro = requestAnimationFrame(leer);
      } catch {
        setFalla('No se pudo abrir la cámara. Escribí el código que está debajo del QR (es lo mismo). Si preferís la cámara: cuando el celular pregunte, tocá «Permitir».');
      }
    })();

    return () => {
      terminado = true;
      cancelAnimationFrame(cuadro);
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
    };
  }, [alLeer]);

  return (
    <div className="escaner">
      {falla ? (
        <div className="error-grande">{falla}</div>
      ) : (
        <>
          <div className="visor">
            <video ref={video} muted playsInline />
            <div className="marco" aria-hidden="true" />
          </div>
          <p className="ayuda" style={{ textAlign: 'center' }}>Apuntá la cámara al QR que te dio el organizador.</p>
        </>
      )}
      <canvas ref={lienzo} hidden />
      <button className="boton secundario" onClick={alCancelar}>Cancelar</button>
    </div>
  );
}
