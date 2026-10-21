// Etapa 9 (R17): «Primeros pasos» del Responsable general.
// Una lista corta, en orden, de lo que hay que hacer después de instalar.
// Lo que la app puede comprobar se marca solo; lo demás se marca a mano («Ya lo hice»).

export const PASOS_INICIALES = [
  {
    id: 'institucion',
    titulo: 'Cargar los datos de la institución',
    explica: 'Nombre, colores y logo. Así la app muestra el nombre de tu institución en todas las pantallas.',
    ir: 'institucion',
    boton: 'Cargar datos',
  },
  {
    id: 'personas',
    titulo: 'Dar de alta al equipo',
    explica: 'Hace falta al menos un Organizador (arma los eventos) y un Tesorero (recibe el efectivo). Pueden ser la misma persona, incluso vos: a una persona se le pueden dar varios roles.',
    ir: 'personas',
    boton: 'Ir a Personas y roles',
  },
  {
    id: 'practica',
    titulo: 'Hacer la práctica',
    explica: 'Antes del primer evento real, un Organizador practica con un evento de mentira (unos 10 minutos): en «Crear eventos», «Crear evento de práctica»; crear un QR de cargador, activarlo en un celular, cargar una inscripción (con internet y otra en modo avión) y marcar un presente. Se tilda solo. La práctica se borra sola al terminar la semana.',
    ir: 'eventos',
    boton: 'Ir a practicar',
    requiere: 'organizador',
  },
  {
    id: 'evento',
    titulo: 'Crear el primer evento',
    explica: 'Lo hace un Organizador en «Crear eventos»: la app hace las preguntas de a una.',
    ir: 'eventos',
    boton: 'Crear un evento',
    requiere: 'organizador',
  },
  {
    id: 'respaldo',
    titulo: 'Comprobar el respaldo diario',
    explica: 'No hay que hacer nada: se tilda solo la mañana siguiente a la instalación (entre las 8 y las 9, más o menos), cuando la revisión diaria encuentra el primer respaldo bueno. Si a mediodía sigue sin tilde: entrá a GitHub → pestaña «Actions» → «Respaldo diario» y mirá que la última fila esté en verde ✅; después, en «Revisión diaria», tocá «Run workflow» dos veces y recargá esta página. Si algún día llega un correo de GitHub avisando que falló algo, buscá el mensaje en «¿Qué hago si…?».',
    manual: true,
  },
  {
    id: 'hoja',
    titulo: 'Guardar la hoja de accesos',
    explica: 'Todas las contraseñas y claves anotadas a mano, en papel, guardado en un lugar seguro. Sin la clave de respaldo, los respaldos no se pueden abrir.',
    manual: true,
  },
];

// estado: { institucionConfigurada, usuarios: [{activo, roles}], eventos: [], practicaHecha, hechosAMano: {id:true} }
export function evaluarPrimerosPasos(estado) {
  const activos = (estado.usuarios || []).filter((u) => u.activo);
  const conRol = (rol) => activos.some((u) => (u.roles || []).includes(rol));
  const auto = {
    institucion: !!estado.institucionConfigurada,
    personas: conRol('organizador') && conRol('tesorero'),
    evento: (estado.eventos || []).some((e) => !e.practica),
    practica: !!estado.practicaHecha, // D66: alguien del equipo hizo la práctica completa de Organizador
    respaldo: !!estado.respaldoOk, // D58: lo marca solo la revisión diaria cuando ve un respaldo bueno
  };
  const manuales = estado.hechosAMano || {};
  const pasos = PASOS_INICIALES.map((p) => ({ ...p, hecho: p.manual ? !!manuales[p.id] || !!auto[p.id] : !!auto[p.id] }));
  const hechos = pasos.filter((p) => p.hecho).length;
  const siguiente = pasos.find((p) => !p.hecho) || null;
  return { pasos, hechos, total: pasos.length, completo: !siguiente, siguiente: siguiente && siguiente.id };
}
