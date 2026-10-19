# Pruebas integradas (la app real contra una base local)

Recorren la app en un navegador (Playwright) contra PostgreSQL 16 + PostgREST locales con todas las funciones
SQL del proyecto. Solo se simula el envío del correo con el código (Supabase Auth): ver `e2e_real.py`.

Preparación (una vez): PostgreSQL en el puerto 5433, base `real` cargada con `init_real.sql` (más 009 a 011),
PostgREST con `db-uri = postgres://authenticator:x@localhost:5433/real?host=/tmp` y
`jwt-secret = secreto-de-prueba-de-al-menos-32-caracteres!!`, y la app compilada servida con
`npx vite preview --port 4173` (con `config/conexion.json` apuntando a cualquier `*.supabase.co`: las llamadas se desvían).

- `e2e_panel.py`: panel, roles, QR, rendiciones, Excel.
- `e2e_puerta.py`: control de presentes con tres celulares.
- `e2e_config.py`: datos de la institución y momentos de asistencia.
- `e2e_asistente.py`: asistente para crear eventos, de punta a punta.
- `e2e_cierre.py`: cerrar y reabrir inscripciones; evento sin cobro.
- `inst_integrada.mjs`: el instalador con el servidor simulado, ejecutando el SQL de verdad en bases vacías como las de Supabase.

Ojo: `e2e_puerta.py` y `e2e_config.py` le activan el rol Organizador a carlos@gmail.com desde el panel; si ya lo tiene, se lo sacan.
- `e2e_primeros.py` (Etapa 9): lista «Primeros pasos» del Responsable general, ayuda de cada pantalla y mensajes de error (base desactualizada, código desconocido). Correr con la base recién cargada.
- `e2e_ayuda.py` (Etapa 9): guía «¿Qué hago si…?» en el celular, con buscador y sin internet.

Orden que funciona: cada prueba con la base recién cargada, salvo `e2e_asistente.py` y `e2e_cierre.py`, que necesitan correr después de `e2e_real.py` (que le da el rol Organizador a carlos@gmail.com). `e2e_panel.py` usa un servidor simulado de la Etapa 4.1 y quedó desactualizado: lo reemplazan `e2e_real.py` y las demás.
- `e2e_practica.py` (Etapa 9, D56): evento de práctica de punta a punta (crear con un toque, QR marcado, celular con la franja, carga, puerta, Excel PRACTICA_, limpieza al vencer). Correr con la base recién cargada (con 014).
- `e2e_hibrido.py` (R18, D57): evento híbrido de punta a punta (asistente con cupo, cierre automático al llenarse, celular que solo ofrece «Virtual», panel, puerta solo con presenciales, ampliar el cupo reabre).
- `e2e_estado.py` (Etapa 9, D58): «Estado del sistema» y cartel del Resumen con revisiones simuladas (sin revisiones, respaldo fallado, revisión vieja, todo bien y el paso del respaldo que se marca solo).
- `e2e_tickets.py` (D60): rendición del efectivo y de los tickets de la terminal (celular con la lista de tickets, «Faltan tickets» en Rendiciones, entrega registrada, Excel).
- `e2e_celular_chico.py`: pantallas del celular (cargador, ayuda y puerta) en 320, 360 y 412 px de ancho: nada se sale a los costados y los botones principales miden al menos 40 px.
- `e2e_grupos.py` (D61) y `e2e_autopresente.py` (D62): inscripción por grupo y autopresente con QR, de punta a punta.
- `e2e_borrar_practica.py` (D63 a D66): nombre repetido, borrar un evento vacío, archivar uno con datos (antes hay que rendir), cambiar de QR y dejar el acceso en el celular, aviso de la primera vez y avisos de práctica. Correr con la base recién cargada **sin** la práctica de Carlos anotada.
- Los demás recorridos suponen que Carlos ya hizo la práctica (si no, «Crear evento nuevo» muestra el aviso de práctica): después de cargar la base, `insert into practicas_hechas (correo, paso) select 'carlos@gmail.com', unnest(array['crear','qr','inscripcion','presente','rendicion'])`.
- `e2e_guia_practica.py` (D68, D69): asistente de práctica paso a paso (crear, QR con el formulario ya abierto, QR cerrado sin activar → «Crear otro QR», celular, presente, Tesorero y festejo) y preguntas frecuentes opcionales en el asistente de eventos. Correr con `SIN_PRACTICA=1`.
