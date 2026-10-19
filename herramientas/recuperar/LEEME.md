# Recuperar un respaldo (D59)

Dos botones en GitHub (pestaña **Actions**):

1. **Recuperar respaldo (en la base de pruebas)**: se elige la fecha (vacío = el más reciente) y la base de **pruebas** queda
   con los datos de ese día. Nunca toca la base real. Ahí se mira lo que se perdió (Supabase → proyecto de pruebas → Table Editor).
2. **Pasar un respaldo a la base real**: reemplaza la base real. Pide escribir `REEMPLAZAR LA BASE REAL`. Antes guarda una copia
   cifrada de cómo estaba («antes-de-recuperar-…», 90 días); para **deshacer**, se vuelve a correr escribiendo ese nombre en la fecha.

`recuperar.sh` hace todo en **una sola operación** (vaciar, cargar y poner al día con `base-de-datos-completa`): si algo falla,
la base de destino queda exactamente como estaba. `vaciar_public.sql` tiene un seguro: no corre fuera de `recuperar.sh`.

Prueba: `bash herramientas/recuperar/probar_local.sh` (PostgreSQL local; 9 escenarios: seguro, clave equivocada, respaldo dañado,
falla a mitad de camino, recuperar en pruebas, permisos, recuperar en real con copia previa, deshacer y respaldo de una versión vieja).
Instalación a mano (caso testigo): además, el secret `SUPABASE_DB_URL_PRUEBAS` (cadena «Session pooler» de la base de pruebas).
