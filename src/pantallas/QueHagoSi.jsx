import { useMemo, useState } from 'react';
import { SECCIONES } from '../ayuda/queHagoSi.js';

// Etapa 9 (R17): guía «¿Qué hago si…?» dentro de la app (/#ayuda). Funciona sin internet.
const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function QueHagoSi() {
  const [buscar, setBuscar] = useState('');
  const secciones = useMemo(() => {
    const palabras = normal(buscar).split(/\s+/).filter((p) => p.length > 2);
    if (palabras.length === 0) return SECCIONES;
    return SECCIONES.map((s) => ({
      ...s,
      casos: s.casos.filter((c) => {
        const texto = normal(`${c.pregunta} ${c.pasos.join(' ')}`);
        return palabras.every((p) => texto.includes(p));
      }),
    })).filter((s) => s.casos.length > 0);
  }, [buscar]);
  const filtrando = normal(buscar).split(/\s+/).some((p) => p.length > 2);

  return (
    <main className="contenido que-hago-si">
      <button className="enlace" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = ''))}>← Volver</button>
      <h1>¿Qué hago si…?</h1>
      <p className="ayuda">Problemas frecuentes y qué hacer. Tocá una pregunta para ver la respuesta, o escribí una palabra (por ejemplo «internet», «código» o «efectivo»).</p>
      <input id="buscar-ayuda" className="buscador-ayuda" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" autoComplete="off" />
      {secciones.length === 0 && <p className="advertencia">No encontramos nada con esas palabras. Probá con otra, más corta.</p>}
      {secciones.map((s) => (
        <section key={s.id}>
          <h2>{s.titulo}</h2>
          {s.casos.map((c) => (
            <details key={c.pregunta} className="caso" open={filtrando}>
              <summary>{c.pregunta}</summary>
              <ol>{c.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
            </details>
          ))}
        </section>
      ))}
    </main>
  );
}
