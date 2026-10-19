import Ayuda from './Ayuda.jsx';
import { formatoPesos } from '../logica/precios.js';
import { formatoFechaHora } from '../logica/fechas.js';

export default function Resumen({ cargador, resumen, alVolver }) {
  if (!resumen) return null;
  return (
    <main className="contenido">
      <h2>Resumen para rendir</h2>
      <Ayuda tema="rendir" />
      <p className="ayuda">Cargador: <strong>{cargador}</strong>. Incluye todo lo cargado en este dispositivo.</p>

      <h3>Para entregarle al Tesorero</h3>
      <div className="rendir">
        <span>💵 Efectivo</span>
        <strong>{formatoPesos(resumen.porMedio.efectivo)}</strong>
        <small>{resumen.cantidadPorMedio.efectivo} {resumen.cantidadPorMedio.efectivo === 1 ? 'inscripción' : 'inscripciones'} en efectivo</small>
      </div>
      {resumen.cantidadPorMedio.terminal > 0 && (
        <div className="rendir">
          <span>🧾 Tickets en papel de la terminal</span>
          <strong>{resumen.cantidadPorMedio.terminal} {resumen.cantidadPorMedio.terminal === 1 ? 'ticket' : 'tickets'}</strong>
          <small>Por {formatoPesos(resumen.porMedio.terminal)}. Juntalos con esta lista:</small>
          <ol className="lista-tickets">
            {(resumen.ticketsTerminal || []).map((t) => (
              <li key={t.id}><span>{t.nombre}</span><span>{formatoPesos(t.monto)}</span><small>{formatoFechaHora(t.creadaEn)}</small></li>
            ))}
          </ol>
        </div>
      )}
      <p className="ayuda">Las transferencias no se entregan: ya están en la cuenta.</p>

      <h3>Todo lo cobrado</h3>

      <table className="tabla">
        <tbody>
          <tr><td>Terminal con ticket</td><td>{resumen.cantidadPorMedio.terminal}</td><td>{formatoPesos(resumen.porMedio.terminal)}</td></tr>
          <tr><td>Transferencia</td><td>{resumen.cantidadPorMedio.transferencia}</td><td>{formatoPesos(resumen.porMedio.transferencia)}</td></tr>
          {resumen.cantidadPorMedio.sin_cobro > 0 && <tr><td>Sin cobro (evento gratuito)</td><td>{resumen.cantidadPorMedio.sin_cobro}</td><td>{formatoPesos(0)}</td></tr>}
          <tr className="fuerte"><td>Total cobrado</td><td>{resumen.cantidad}</td><td>{formatoPesos(resumen.total)}</td></tr>
        </tbody>
      </table>

      <p className="ayuda">
        Es todo lo que cobraste con este celular. Lo que ya le entregaste al Tesorero no se descuenta acá: el Tesorero lo
        registra en el panel. Antes de rendir, conectate a internet para que se envíe todo.
      </p>
      <button className="boton secundario" onClick={alVolver}>Volver</button>
    </main>
  );
}
