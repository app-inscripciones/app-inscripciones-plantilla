import { etiquetaEvento } from '../logica/fechas.js';

// D77 · El QR del cargador tiene varios eventos: antes de cada inscripción se elige para cuál es.
export default function ElegirEvento({ eventos, disponible, alElegir, alVolver }) {
  return (
    <main className="contenido">
      <h2>¿Para qué evento es la inscripción?</h2>
      <p className="ayuda">Tocá el evento. Después aparece el formulario con los precios de ese evento.</p>
      <div className="lista-eventos">
        {eventos.map((e) => {
          const abierto = disponible(e.id);
          return (
            <button key={e.id} className="boton grande elegir-evento" disabled={!abierto} onClick={() => alElegir(e.id)}>
              <strong>{etiquetaEvento(e)}</strong>
              {!abierto && <small> · inscripciones cerradas</small>}
            </button>
          );
        })}
      </div>
      <button className="boton secundario" onClick={alVolver}>Volver</button>
    </main>
  );
}
