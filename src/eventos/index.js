// Eventos disponibles en esta etapa (configurados a mano como modelos).
// En la Etapa 2 los eventos van a venir de la base central.
import retiro from './retiro-matrimonios.json';
import congreso from './congreso-prueba.json';

export const EVENTOS = [congreso, retiro];

export const buscarEvento = (id) => EVENTOS.find((e) => e.id === id) || null;
