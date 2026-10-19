# Simulacro automático (Etapa 5, parte que no necesita personas)

Contra la base local de pruebas integradas (PostgREST apuntando a una base cargada con `init_real.sql` + 009 a 012):

- `carga.py`: 3.000 inscripciones de 10 cargadores a la vez (10 % reenviadas), 30 DNI repetidos, 5 montos que no
  corresponden, 3 celulares en la puerta marcando a las mismas 1.500 personas, y tiempos del panel.
- `navegador.py`: la puerta con 3.000 inscriptos en un celular lento (búsqueda) y el Excel de 3.000 filas.
- `comparar_monto.mjs`: 3.000 casos al azar del cálculo del monto: la app y la base tienen que dar lo mismo (D51).
- `cupo.py` (R18, D57): evento híbrido con cupo 100 y 10 cargadores a la vez (150 presenciales intentadas, 10 % reenviadas,
  2 celulares sin señal). Controla que no se pierda ni duplique nada, el dinero exacto, un solo cierre automático y que
  toda presencial cargada después del cierre quede marcada «sobre el cupo». Encontró una carrera (2 sin marcar), corregida
  en `015_modalidad.sql` haciendo que las presenciales de un evento híbrido entren de a una.
