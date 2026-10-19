# Revisión diaria y avisos automáticos (Etapa 9, D58)

`revisar.mjs` lo corre GitHub todos los días (workflow **Revisión diaria**, 07:47 hora argentina). Revisa el respaldo,
que la base responda y que las bases de Supabase no estén pausadas, las llaves de Supabase y Cloudflare (y cuándo vence
la de Cloudflare), la versión de la base, el espacio y que el Gmail pueda mandar correos. Guarda el resultado en la tabla
`revisiones` (el panel lo muestra en **Estado del sistema**) y, si algo necesita atención, manda un correo en castellano
a los Responsables generales y al Gmail de la institución (`correo.py`, con la contraseña de aplicación).

- Un problema 🔴 se avisa todos los días hasta que se arregla; un aviso 🟡, solo cuando aparece.
- Si hay un problema y el correo no se puede mandar, la tarea termina en rojo y GitHub avisa por su cuenta.
- Pruebas: `revisar.test.js` (servicios simulados) y `herramientas/pruebas-integradas/e2e_estado.py`.
- Instalación a mano (caso testigo): además de `SUPABASE_DB_URL`, cargar los secrets `GMAIL_CORREO` y `GMAIL_CLAVE_APLICACION`.
