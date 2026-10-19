// Eventos por grupo de ejemplo para las pruebas automáticas (D61).
// Torneo: equipos de 5 a 6, un precio por equipo (anticipado hasta el 10/03).
export const TORNEO = {
  id: 'torneo', nombre: 'Torneo de fútbol', fecha: '2027-03-20', unidad: 'grupo',
  grupo: { nombre: 'equipo', min: 5, max: 6, cobro: 'grupo' },
  categorias: [],
  campos: [
    { id: 'nombre_grupo', etiqueta: 'Nombre del equipo', tipo: 'texto', obligatorio: true },
    { id: 'telefono', etiqueta: 'Teléfono de contacto', tipo: 'telefono', obligatorio: true },
    { id: 'nombre', etiqueta: 'Nombre y apellido', tipo: 'texto', obligatorio: true, porIntegrante: true },
    { id: 'dni', etiqueta: 'DNI', tipo: 'dni', obligatorio: true, porIntegrante: true },
  ],
  conceptos: [{ id: 'inscripcion', nombre: 'Inscripción del equipo', aplicaSi: null,
    precios: [{ hasta: '2027-03-10', monto: 40000, nombreTramo: 'Precio anticipado' }, { monto: 50000, nombreTramo: 'Precio normal' }] }],
};

// Familia: de 2 a 8, según cada integrante (por categoría) + transporte para todos si el grupo viaja.
export const FAMILIAS = {
  id: 'familias', nombre: 'Retiro de familias', fecha: '2027-04-10', unidad: 'grupo',
  grupo: { nombre: 'familia', min: 2, max: 8, cobro: 'integrante' },
  categorias: [{ id: 'ninos', nombre: 'Niños', edadMin: 0, edadMax: 12 }, { id: 'adultos', nombre: 'Adultos', edadMin: 13, edadMax: 120 }],
  campos: [
    { id: 'nombre_grupo', etiqueta: 'Apellido de la familia', tipo: 'texto', obligatorio: true },
    { id: 'telefono', etiqueta: 'Teléfono de contacto', tipo: 'telefono', obligatorio: true },
    { id: 'transporte', etiqueta: '¿Viajan en el colectivo?', tipo: 'si_no', obligatorio: true },
    { id: 'nombre', etiqueta: 'Nombre y apellido', tipo: 'texto', obligatorio: true, porIntegrante: true },
    { id: 'dni', etiqueta: 'DNI', tipo: 'dni', obligatorio: false, porIntegrante: true },
    { id: 'edad', etiqueta: 'Edad', tipo: 'numero', obligatorio: true, min: 0, max: 120, porIntegrante: true },
  ],
  conceptos: [
    { id: 'matricula', nombre: 'Matrícula', aplicaSi: null, precios: [{ porCategoria: { ninos: 2000, adultos: 5000 } }] },
    { id: 'transporte', nombre: 'Transporte', aplicaSi: { campo: 'transporte', igual: 'si' }, precios: [{ monto: 1000 }] },
  ],
};

