import { useInstitucion } from '../datos/institucion.js';

// Nombre (y logo, si hay) de la institución en el encabezado.
export default function Marca({ titulo }) {
  const inst = useInstitucion();
  return (
    <div className="marca">
      {inst.logo && <img src={inst.logo} alt="" className="marca-logo" />}
      <div>
        <div className="app">{inst.nombreApp} · {inst.nombre}</div>
        {titulo && <div className="evento">{titulo}</div>}
      </div>
    </div>
  );
}
