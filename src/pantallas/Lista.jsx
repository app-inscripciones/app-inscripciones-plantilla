import { formatoPesos } from '../logica/precios.js';
import { formatoFechaHora } from '../logica/fechas.js';
import { nombreMedio } from '../logica/validacion.js';
import { MENSAJES_ERROR } from '../datos/sincronizacion.js';
import { esGrupo, nombreDeInscripcion } from '../logica/grupo.js';

const ESTADOS = {
  pendiente: { icono: '🟡', texto: 'Pendiente de envío' },
  enviando: { icono: '🔵', texto: 'Enviando' },
  sincronizado: { icono: '🟢', texto: 'Enviada a la base central' },
  error: { icono: '🔴', texto: 'No se pudo enviar' },
  anulada: { icono: '⚪', texto: 'Anulada' },
};

function titulo(evento, i) {
  if (esGrupo(evento)) return `${nombreDeInscripcion(i.datos)} (${(i.datos.integrantes || []).length})`;
  if (evento.unidad === 'pareja') return `${i.datos.hombre} y ${i.datos.mujer}`;
  return i.datos.nombre || 'Sin nombre';
}

export default function Lista({ evento, inscripciones, alVolver }) {
  return (
    <main className="contenido">
      <h2>Inscripciones en este dispositivo</h2>
      {inscripciones.length === 0 && <p className="ayuda">Todavía no hay inscripciones.</p>}
      <ul className="lista">
        {inscripciones.map((i) => {
          const e = ESTADOS[i.estado] || ESTADOS.pendiente;
          const cat = evento.categorias.find((c) => c.id === i.categoria);
          return (
            <li key={i.id} className="item">
              <div className="item-titulo">{titulo(evento, i)}</div>
              <div className="item-detalle">
                {cat ? `${cat.nombre} · ` : ''}
                {formatoPesos(i.monto)} · {nombreMedio(i.pago.medio)}
              </div>
              <div className="item-detalle">
                {formatoFechaHora(i.creadaEn)} · {i.cargador}
              </div>
              <div className="item-estado">
                {e.icono} {e.texto}
                {i.estado === 'sincronizado' && i.numeroOrden ? ` · Nº ${i.numeroOrden}` : ''}
              </div>
              {i.estado === 'error' && <div className="error">{MENSAJES_ERROR[i.error] || MENSAJES_ERROR.datos_invalidos}</div>}
            </li>
          );
        })}
      </ul>
      <button className="boton secundario" onClick={alVolver}>Volver</button>
    </main>
  );
}
