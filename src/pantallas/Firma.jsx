// D71: línea de autor al pie de todas las pantallas. Va fija en la aplicación (igual para todas las instituciones),
// al final del contenido: no flota ni tapa botones. No se imprime.
export const TEXTO_FIRMA = 'Aplicación gratuita para instituciones · Creada por Carlos Coschiza';

export function Firma() {
  const [a, b] = TEXTO_FIRMA.split(' · ');
  return <footer className="firma" aria-label="Autoría"><span>{a}</span> · <span>{b}</span></footer>;
}
