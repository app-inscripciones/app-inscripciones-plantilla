import { definicionPractica } from '../../src/logica/practica.js';
const hoy = process.argv[2];
process.stdout.write(JSON.stringify(definicionPractica(hoy)));
