# Instalación paso a paso

**Para quién es:** para la persona de la institución que va a poner en marcha el sistema. No hace falta saber de tecnología: hay que seguir los pasos **en orden**, sin saltear ninguno.

**Qué hace falta:**

- Una **computadora** con internet y el navegador **Chrome**.
- Un **celular** (para la verificación en dos pasos y la app **Google Authenticator**).
- Entre **1 hora y 1 hora y media**, sin apuro. **Se puede hacer en partes**: al terminar cada paso, se puede frenar y seguir otro día.
- La **Hoja de accesos** (documento 1) **impresa** y una lapicera. Las contraseñas y claves se anotan **solo ahí, a mano**: nunca en la computadora, en el correo ni en WhatsApp.

**Cómo es:**

1. **A mano (pasos 1 a 6):** crear las cuentas que los servicios exigen que cree una persona y copiar cuatro claves.
2. **Automático (paso 7):** tocar el botón **Instalar**. El sistema hace todo lo demás.
3. **Desde la aplicación (paso 8):** seguir la lista **Primeros pasos** del panel.

> **Regla de oro:** cada servicio lleva **una contraseña distinta**. Todas van a la Hoja de accesos.

> 📝 En cada paso, el recuadro **«Anotá en la hoja»** dice qué casillas completar (por ejemplo, **B2**). El recuadro **«✅ Cómo sé que salió bien»** dice qué tiene que aparecer antes de seguir.

---

## Paso 1. El Gmail de la institución

Todas las cuentas quedan a nombre de este correo, no de una persona. Si mañana otra persona se hace cargo, se le entrega este acceso.

1. Entrar a **accounts.google.com/signup**.
2. Nombre: algo que identifique a la institución (por ejemplo «Inscripciones» «Club Las Palmas»).
3. Dirección: por ejemplo **inscripciones.laspalmas@gmail.com**.
4. Contraseña larga y nueva.
5. Teléfono: el celular del Responsable general.
6. **Correo de recuperación:** agregar el correo personal del Responsable general (**myaccount.google.com → Seguridad → Correo de recuperación**). Evita quedar bloqueado.

**Verificación en dos pasos (obligatoria):**

1. Entrar a **myaccount.google.com/security** y tocar **Verificación en dos pasos**.
2. **Mirá qué aparece:**
   - Si hay un botón **«Comenzar»** o **«Activar»**: tocarlo, cargar el celular y escribir el código que llega por SMS.
   - Si aparece una lista (Llaves de acceso, Notificación de Google, Authenticator, **Número de teléfono** con un ✅ verde, **Códigos de verificación alternativos**) y abajo el botón **«Desactivar la verificación en dos pasos»**: **ya está activada**. No hace falta ningún SMS; seguí con el punto 3. (Pasa cuando el celular ya estaba cargado en la cuenta.)
3. Tocar **«Códigos de verificación alternativos»** (la última fila) → **Obtener códigos**. Aparecen **10 códigos de 8 números**: copiarlos a mano en la hoja.

> **Si el SMS no llega:** revisá el número: en Argentina va **+54 9** y la característica sin 0 y sin 15 (por ejemplo, +54 9 362 4555666). Elegí **«Llamada de voz»** para que Google te dicte el código. Esperá 2 o 3 minutos antes de pedir otro. Si sigue sin llegar, usá otro número o probá unas horas más tarde (Google limita los códigos a un número que ya está en varias cuentas).

> Si Google pide «escaneá este QR con tu celular»: usar los **datos móviles** del celular (no el Wi-Fi) y no reintentar muchas veces seguidas; después de varios intentos, Google bloquea el acceso por unas horas.

**Contraseña de aplicación** (para que el sistema pueda mandar los códigos de ingreso por correo):

1. Con la sesión del Gmail de la institución abierta, entrar a **myaccount.google.com/apppasswords**.
2. Nombre: «Supabase» → **Crear**.
3. Aparece una clave de **16 letras**. Se usa en el paso 6.

> Si la página dice que no está disponible, la verificación en dos pasos todavía no quedó activa: esperar unos minutos y volver a probar.

> 📝 **Anotá en la hoja:** B1 (dirección), B2 (contraseña), B3 (celular), B4 (correo de recuperación), B5 (códigos de seguridad) y B6 (contraseña de aplicación de 16 letras).

> ✅ **Cómo sé que salió bien:** abrí una **ventana de incógnito** (Ctrl + Shift + N), entrá a **gmail.com** con la dirección y la contraseña: tiene que pedir **un segundo paso** (un código o una confirmación en el celular).

## Paso 2. La cuenta de GitHub

GitHub guarda el programa de la aplicación y hace las tareas automáticas (instalar, publicar, respaldos, revisión diaria).

1. **github.com/signup** → registrarse con el Gmail de la institución y una **contraseña nueva**.
2. Usuario: por ejemplo **inscripciones-laspalmas**.
3. Confirmar con el código que llega al Gmail. Plan **Free**.
4. **Verificación en dos pasos:** foto de perfil → **Settings** → **Password and authentication** → **Enable two-factor authentication** → **Authenticator app**. En el celular, instalar **Google Authenticator**, tocar **+** y escanear el código. Escribir el número de 6 dígitos.
5. Descargar los **recovery codes** (códigos de recuperación) e imprimirlos o copiarlos a mano.

> 📝 **Anotá en la hoja:** C1 (usuario), C2 (contraseña), C3 (en qué celular está Google Authenticator) y C4 (dónde guardaste los recovery codes).

> ✅ **Cómo sé que salió bien:** cerrá la sesión de GitHub y volvé a entrar: tiene que pedir la contraseña **y** el número de Google Authenticator.

## Paso 3. La copia de la aplicación

1. Con la sesión de GitHub de la institución abierta, entrar a la **plantilla**: **github.com/inscripciones-iglesia/app-inscripciones-plantilla**.
2. Tocar **Use this template** → **Create a new repository**.
3. Owner: la cuenta de la institución. Nombre: **app-inscripciones**. Elegir **Private**. Tocar **Create repository**.

> 📝 **Anotá en la hoja:** C5 (la dirección del repositorio, por ejemplo github.com/inscripciones-laspalmas/app-inscripciones).

> ✅ **Cómo sé que salió bien:** arriba a la izquierda dice **inscripciones-laspalmas / app-inscripciones** con la etiqueta **Private**.

## Paso 4. La cuenta de Supabase y su llave

Supabase es donde van a estar las bases de datos (la real y la de pruebas). **No hace falta crearlas a mano**: lo hace el instalador.

1. Entrar a **supabase.com** → **Start your project** → **Continue with GitHub** → **Authorize**. Queda creada una organización con plan **Free**. Si en algún momento pide tarjeta, **no cargarla**.
2. Crear la **llave** para el instalador. Camino corto: abrir **supabase.com/dashboard/account/tokens**. (Camino largo: arriba a la derecha, el ícono de la cuenta → **Account preferences** → **Access Tokens**.) Tocar **Generate new token** (la parte verde del botón, no la flechita) y completar:
   - **Name:** «Instalador». **Expires in:** **Never**.
   - **Resource access:** **Organization** → elegir la organización.
   - **Permissions:** tocar «Preset · No access» → **Full access** (aparece un aviso amarillo: es normal).
   - **Review access** → confirmar.
3. Copiar la llave (empieza con `sbp_`). **Se muestra una sola vez.** Dejar esa pestaña abierta y pegarla en el paso 6. **No se anota en ningún lado.**

> 📝 **Anotá en la hoja:** D1 (nombre de la organización de Supabase) y tildá D2 cuando la llave esté cargada en GitHub (paso 6).

> ✅ **Cómo sé que salió bien:** en supabase.com, arriba a la izquierda, se ve la organización con la etiqueta **FREE**, y en **Access Tokens** aparece «Instalador».

## Paso 5. La cuenta de Cloudflare y su llave

Cloudflare publica la aplicación en internet (una dirección como `inscripciones-laspalmas.pages.dev`).

1. **dash.cloudflare.com/sign-up** → registrarse con el Gmail de la institución y una **contraseña nueva**.
2. Abrir el correo de Cloudflare y tocar el enlace para **verificar la cuenta**.
3. Si ofrece agregar un dominio o un plan pago: **saltear**.
4. **Verificación en dos pasos:** perfil (arriba a la derecha) → **My Profile** → **Authentication** → **Two-Factor Authentication** → escanear con Google Authenticator → guardar los **backup codes**.
5. Crear la **llave**. Camino corto: abrir **dash.cloudflare.com/profile/api-tokens**. (Camino largo: **My Profile** → **API Tokens**.) Tocar **Create Token** → **Create Custom Token** → **Get started**.
   - Nombre: «Instalador».
   - Permisos: **Account** → **Cloudflare Pages** → **Edit**. Tocar **+ Add more** y agregar **Account** → **Account Settings** → **Read**.
   - Account Resources: **Include** → la cuenta de la institución.
   - Si pide fecha de vencimiento (TTL), dejarla vacía o elegir la más lejana.
   - **Continue to summary** → **Create Token**.
6. Copiar la llave. **Se muestra una sola vez.** Pegarla en el paso 6.

> 📝 **Anotá en la hoja:** E1 (contraseña), E2 (dónde guardaste los backup codes) y E3 (fecha de vencimiento de la llave, si tiene).

> ✅ **Cómo sé que salió bien:** en **My Profile → API Tokens** aparece «Instalador» con estado **Active**.

## Paso 6. Cargar las cuatro claves en GitHub

1. En GitHub, abrir el repositorio **app-inscripciones** de la institución → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Camino corto: escribir en el navegador la dirección del repositorio (casilla C5) y agregarle al final **/settings/secrets/actions**.
2. Crear estos cuatro, uno por uno. El nombre tiene que estar **exactamente** así, con mayúsculas:

| Nombre | Qué se pega |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | La llave de Supabase (paso 4) |
| `CLOUDFLARE_API_TOKEN` | La llave de Cloudflare (paso 5) |
| `CLAVE_RESPALDO` | Una clave **inventada** y larga (mínimo 16 caracteres; por ejemplo, cuatro palabras con números). **Sin ella no se pueden abrir los respaldos** |
| `GMAIL_CLAVE_APLICACION` | La contraseña de aplicación de 16 letras (paso 1, casilla B6) |

> GitHub guarda los secrets cifrados y no los vuelve a mostrar. Si uno se carga mal, se vuelve a crear con el mismo nombre (reemplaza al anterior).

> 📝 **Anotá en la hoja:** F1 (la CLAVE_RESPALDO, letra por letra: es la más importante). **Anotala antes de pegarla en GitHub**: después GitHub no la deja ver nunca más, así que la hoja es la única copia. No es una cuenta: no tiene dirección web ni usuario. Tildá también D2 y E4.

> ✅ **Cómo sé que salió bien:** en **Secrets and variables → Actions** se ven los **cuatro nombres** de la tabla, escritos igual.

## Paso 7. El botón «Instalar»

1. En el repositorio → pestaña **Actions** (o la dirección del repositorio, casilla C5, con **/actions** al final). Si pregunta, tocar **I understand my workflows, go ahead and enable them**.
2. A la izquierda, **Instalar** → a la derecha, **Run workflow**.
3. Completar:
   - **Nombre de la institución:** como se va a ver en la aplicación (ej.: «Club Atlético Las Palmas»).
   - **Gmail de la institución:** el del paso 1.
   - **Correo del primer Responsable general:** con el que va a entrar al panel esa persona (puede ser el personal).
   - **Nombre y apellido del Responsable general.**
4. Tocar **Run workflow** (el botón verde). Aparece una ejecución en amarillo 🟡. Tarda entre **5 y 15 minutos**.
5. Cuando termina en verde ✅, tocar la ejecución: arriba aparece el **resumen** con la dirección de la aplicación y la del panel.

**Qué hace solo el instalador:** crea las dos bases de datos (real y de pruebas), carga todas las tablas y reglas de seguridad, da de alta al Responsable general, configura los correos con el código de ingreso y publica la aplicación. Desde ese momento, todos los días se hace un **respaldo cifrado** y el sistema **se revisa solo** y avisa por correo si algo necesita atención.

**Si termina en rojo ❌:** abrir la ejecución y leer el mensaje en rojo: dice qué falta (por ejemplo, una llave mal copiada). Corregir y volver a tocar **Run workflow**: lo que ya se hizo no se repite.

> 📝 **Anotá en la hoja:** A (datos del Responsable general), G1 (fecha), G2 (dirección de la aplicación) y G3 (dirección del panel, la que termina en `/#panel`).

> ✅ **Cómo sé que salió bien:** la ejecución está en verde ✅ y, al abrir la dirección de la aplicación en el navegador, aparece la pantalla para activar un QR.

## Paso 8. Primer ingreso al panel

1. Abrir la dirección del panel (G3) en la computadora.
2. Escribir el correo del Responsable general → **Enviarme el código** → escribir el código de 6 números que llega por correo (la primera vez, mirar en **Spam** o **Promociones**).
3. Arriba del Resumen aparece la lista **Primeros pasos**. Seguí el documento **3 · Después de instalar**.

> ✅ **Cómo sé que salió bien:** entrás al panel y arriba dice «Hola, *tu nombre* · Responsable general».

---

## Si algo sale mal durante la instalación

| Qué pasa | Qué hacer |
|---|---|
| El instalador dice «Faltan datos: …» | Falta uno de los cuatro secrets o un dato del formulario. Revisar el paso 6 |
| «Cloudflare respondió 403» o «Supabase respondió 401» | La llave está mal copiada o no tiene los permisos de los pasos 4 o 5. Crear una nueva y cargarla otra vez |
| «La base … tardó demasiado en estar lista» | Supabase está lento. Esperar unos minutos y volver a tocar **Run workflow** |
| No llega el código de ingreso | Mirar en Spam. Revisar la contraseña de aplicación del Gmail (paso 1) y volver a instalar |
| «Este correo no está habilitado» | Ese correo no es el que se puso como Responsable general en el paso 7 |
| Google bloqueó el Gmail por intentos | Esperar unas horas y entrar con el correo de recuperación (B4) |

Los problemas del uso diario están en **6 · ¿Qué hago si…?**

---

## Mantenimiento (después de instalar)

- **El sistema se revisa solo** todos los días a la mañana y, si algo necesita atención, manda un correo **en castellano** a los Responsables generales, con qué hacer. En el panel: **Estado del sistema**.
- **Respaldos:** todos los días a la madrugada, cifrados con la CLAVE_RESPALDO (F1). Para recuperar uno: GitHub → **Actions** → **Recuperar respaldo (en la base de pruebas)**; para pasarlo a la base real, **Pasar un respaldo a la base real** (pide escribir REEMPLAZAR LA BASE REAL y se puede deshacer).
- **Actualizaciones:** cuando salga una versión nueva, GitHub → **Actions** → **Actualizar** → **Run workflow**. No se pierden datos. Si el panel dice «La base de datos está desactualizada», es la señal de que hay que tocarlo.
- **Si vence una llave:** crear una nueva (pasos 4 o 5) y cargarla en GitHub con el mismo nombre (paso 6). Anotar el vencimiento nuevo (E3).
- **Si una base se «duerme»:** no hay que hacer nada (se despierta sola dos veces por día). Con apuro: GitHub → **Actions** → **Despertar la base** → **Run workflow**. Ver la tabla de abajo.
- **Si cambia el Responsable general:** el nuevo se da de alta en **Personas y roles** y se le entrega esta carpeta y la Hoja de accesos.

## Si una base se «duerme» (pausa del plan gratuito): qué hacer en cada caso

El plan gratuito de Supabase pausa una base que no se usa durante una semana. **El sistema lo resuelve solo**: dos veces por día (a las 6 y a las 18) revisa las dos bases, despierta la que esté pausada y les hace una consulta mínima para que no se vuelvan a pausar. También evita que GitHub apague las tareas automáticas por falta de cambios.

| Qué pasa | Qué hacer |
|---|---|
| No pasa nada raro | **Nada.** El sistema mantiene las bases despiertas solo |
| Llega un correo: «La base … estaba pausada y se despertó sola» | **Nada.** Ya está resuelto y no se perdió nada |
| El panel no conecta o dice que la base está «dormida» | **Esperar**: se despierta sola en unas horas. Los celulares siguen cargando y envían todo después |
| …y hay apuro (por ejemplo, es el día del evento) | GitHub → **Actions** → **Despertar la base** → **Run workflow** → **Run workflow**. Esperar el verde ✅ (5 a 10 minutos) y actualizar el panel (F5) |
| «Despertar la base» termina en rojo ❌ y habla de la «llave de Supabase» | Crear una llave nueva (paso 4) y cargarla en GitHub con el mismo nombre, `SUPABASE_ACCESS_TOKEN` (paso 6). Volver a tocar **Run workflow** |
| «Despertar la base» termina en rojo ❌ por otro motivo | supabase.com → abrir el proyecto → **Resume project** (el botón blanco; **nunca** «Upgrade to Pro», que es pago) |

