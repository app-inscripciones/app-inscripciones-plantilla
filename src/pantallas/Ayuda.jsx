import { useState } from 'react';
import { TEMAS } from '../ayuda/temas.js';
import enlaces from '../ayuda/enlaces.json';

// Etapa 9 (R17): «¿Cómo se usa esta pantalla?» — una explicación corta en cada pantalla,
// con enlaces al manual y al video del rol cuando estén publicados.
export default function Ayuda({ tema }) {
  const t = TEMAS[tema];
  const [abierta, setAbierta] = useState(false);
  if (!t) return null;
  const manual = enlaces.manuales[t.rol];
  const video = enlaces.videos[t.rol];
  const guia = enlaces.queHagoSi;
  return (
    <div className={`ayuda-pantalla ${abierta ? 'abierta' : ''}`}>
      <button className="ayuda-boton" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <span aria-hidden="true">❓</span> {abierta ? 'Cerrar la ayuda' : '¿Cómo se usa esta pantalla?'}
      </button>
      {abierta && (
        <div className="ayuda-cuerpo" role="region" aria-label={`Ayuda: ${t.titulo}`}>
          <strong>{t.titulo}</strong>
          <ul>{t.puntos.map((p) => <li key={p}>{p}</li>)}</ul>
          {(manual || video || guia) && (
            <p className="ayuda-enlaces">
              {video && <a href={video} target="_blank" rel="noreferrer">▶️ Ver el video</a>}
              {manual && <a href={manual} target="_blank" rel="noreferrer">📖 Abrir el manual</a>}
              {guia && <a href={guia} {...(guia.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' })}>🛟 ¿Qué hago si…?</a>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
