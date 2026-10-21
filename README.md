# PSIQUE

Aplicación de seguimiento psicoterapéutico y administración de consultorio. Se desarrolla con **Ionic y Angular** en el frontend, **Node.js, Express y TypeScript** en la API, y **PostgreSQL 18.6** para la persistencia local.

Esta etapa permite crear y editar pacientes, cargar horarios, agendar sesiones, confirmar que se realizaron y registrar sus honorarios y cobros. Las cuatro tarjetas de Inicio son accesos a estos recorridos y muestran cantidades calculadas a partir de la base de datos.

La interfaz puede usarse en el navegador de una PC y se adapta a pantallas pequeñas. Cada profesional se registra e inicia sesión para acceder a sus propios pacientes, horarios, sesiones y estadísticas. La etapa 4B prepara configuración y seguridad para Render; la ejecución continúa siendo local. No hay servicios remotos creados ni despliegue realizado.

## PostgreSQL: base activa

**PostgreSQL es la única base habitual de Express desde la etapa 3C.**

El backend utiliza un pool de `pg` y el rol `psique_app` sobre `psique`, en
`127.0.0.1:5432`. Registro, login y todas las operaciones de consultorio consultan
PostgreSQL. No hay retorno automático a SQLite ni doble escritura.

Las bases `psique` y `psique_test` tienen las tablas `usuarios`, `pacientes`,
`turnos` y `sesiones`, además del historial técnico `migraciones`. Las migraciones
se ejecutan con un comando independiente y el rol migrador; Express comprueba
el esquema existente sin crear ni modificar tablas. No se importaron datos
desde SQLite ni se crean cuentas o ejemplos al iniciar.

Los archivos, código y pruebas SQLite se conservan como referencia histórica.
Las pruebas PostgreSQL escriben exclusivamente en `psique_test`, separada de
desarrollo. Consultá [POSTGRESQL.md](backend/POSTGRESQL.md) para conocer conexión,
permisos, pruebas y el procedimiento de recuperación del servidor anterior.

## Ejecutar la aplicación

Se necesitan dos terminales, una para cada proceso. El entorno de desarrollo utiliza **Node.js 24.14.1 y npm 11.11.0 en Windows x64**. El backend requiere Node 24.x desde 24.14.1 y el servicio PostgreSQL iniciado, con su esquema aplicado. No hacen falta Angular CLI o Ionic globalmente.

### Terminal 1: backend

Desde la raíz de `APP-PSIQUE`:

```powershell
Set-Location .\backend
npm.cmd install
# El lanzador privado suministra DATABASE_URL solo al proceso.
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea dev
```

La API queda disponible en **http://127.0.0.1:3000/api**. Antes de escuchar,
verifica `JWT_SECRET`, conexión, rol y columnas de las cuatro tablas. Si falta
`DATABASE_URL`, PostgreSQL está caído o el esquema no está disponible, informa
el fallo y no abre HTTP ni crea archivos SQLite.

El lanzador descifra las credenciales locales en memoria y ejecuta
`npm.cmd run dev` con `DATABASE_URL` en el entorno. El secreto JWT actual se carga
desde `backend/.env` y no se modifica. Con la conexión ya suministrada de forma
privada también puede ejecutarse directamente `npm.cmd run dev`.
`dev` usa `--watch`; la comprobación completa de tipos corresponde a `build`.

### Terminal 2: frontend

Desde la raíz de `APP-PSIQUE`, sin entrar en `backend`:

```powershell
npm.cmd install
npm.cmd start
```

Abrí **http://127.0.0.1:4200**. Sin sesión se muestra Login; desde allí se puede crear una cuenta. Ambas terminales deben permanecer activas. `Ctrl+C` detiene el proceso de su terminal. Las instalaciones son necesarias la primera vez o al cambiar dependencias; la raíz y `backend` tienen paquetes y carpetas `node_modules` separados. `npm.cmd` evita las restricciones de ejecución de scripts de PowerShell.

### Compilación y pruebas

Frontend, desde la raíz:

```powershell
npm.cmd run build
```

Genera la aplicación web **local** en `www/browser`; no inicia ni incluye Express o PostgreSQL. Desde la etapa 4B el build predeterminado es `development`, para conservar un resultado utilizable sin conocer todavía los dominios remotos. Para producción se usa `npm.cmd run build:production` y se exige `PSIQUE_API_URL` HTTPS; ver [preparación para Render](#preparación-local-para-render--etapa-4b).

Backend, desde `backend`:

```powershell
npm.cmd run build
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea iniciar
```

El lanzador ejecuta `npm.cmd start` con la conexión privada; con `DATABASE_URL`
ya suministrada puede usarse `npm.cmd start` directamente. `build` comprueba los
tipos y genera `backend/dist`; `start` ejecuta `dist/server.js`. Usá `dev` o `start`,
uno por vez para el mismo puerto. Compilar o iniciar no restaura los datos.

Para ejecutar las pruebas del backend:

```powershell
npm.cmd test
```

Ese comando conserva la suite histórica SQLite. Para PostgreSQL usá el lanzador
privado con `-Tarea probar`, o `npm.cmd run test:postgres` con solo
`TEST_DATABASE_URL`. Todas las pruebas usan datos y entornos aislados;
no se ejecutan sobre `psique` de desarrollo.

### Configuración local

El backend necesita `JWT_SECRET`. Para configurarlo localmente, desde `backend` creá una copia de `.env.example` **solo si aún no tenés `.env`**:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

En `.env`, completá el valor vacío de `JWT_SECRET` con un secreto aleatorio. Este comando genera 32 bytes aleatorios, representados por 64 caracteres hexadecimales; pegá el resultado únicamente en tu `.env` local:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No compartas ni subas ese valor. Los comandos de inicio cargan `.env` mediante `--env-file-if-exists=.env`; también se pueden definir las variables en el entorno del proceso. Si falta el secreto, es demasiado corto o contiene solamente espacios, el servidor se detiene antes de abrir el pool PostgreSQL. No hay una clave predeterminada en el código. Cambiar el secreto invalida los tokens firmados con el anterior.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `NODE_ENV` | `development` | Admite `development`, `test` o `production`. |
| `PORT` | `3000` local; obligatorio en producción | Puerto de Express; Render lo suministrará. |
| `HOST` | `127.0.0.1` local; `0.0.0.0` producción | La escucha pública se rechaza fuera de producción. |
| `DATABASE_URL` | Sin valor predeterminado; obligatoria | Conexión de `psique_app` a `psique`, suministrada de forma privada. |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:4200` local | Origen CORS exacto; obligatorio y HTTPS en producción. |
| `JWT_SECRET` | Sin valor predeterminado; obligatorio | Secreto para firmar y verificar JWT. Generar al menos 32 bytes aleatorios. |
| `DATABASE_SSL_MODE` | `disable` local; `verify-full` producción | Producción exige certificado y nombre de servidor válidos. |
| `DATABASE_SSL_CA_FILE` | Sin valor | Opcional: ruta al certificado público de una CA confiable. |
| `TRUSTED_PROXY_CIDRS` | Vacío | IP/redes del proxy verificadas, separadas por coma; vacío ignora encabezados de IP. |

La API local se limita a `127.0.0.1`. `src/app/api.config.ts` obtiene el destino de `src/environments/environment.ts`; producción reemplaza ese entorno mediante Angular. `localhost` y `127.0.0.1` son orígenes distintos: en desarrollo usá las direcciones indicadas arriba. `PSIQUE_API_URL` es una variable pública de compilación del frontend, nunca una credencial; las demás variables de la tabla pertenecen al backend.

Las credenciales y archivos `.env`, las bases SQLite conservadas, las dependencias y las compilaciones no se versionan. `.env.example` contiene únicamente valores de ejemplo. `DB_PATH` ya no se lee en el servidor habitual. La primera instalación requiere descargar dependencias; luego la aplicación puede ejecutarse localmente con ambos procesos y PostgreSQL iniciado.

## Preparación local para Render — etapa 4B

La arquitectura prevista es **Angular estático → HTTPS → Express permanente →
PostgreSQL administrado**. No se creó infraestructura ni se publicó ningún servicio.
El primer ensayo remoto utilizará datos ficticios. Esta preparación local no
certifica un despliegue ni habilita el uso de datos clínicos reales.

### Angular y Express por entorno

`src/environments/environment.ts` conserva `http://127.0.0.1:3000/api`.
Angular utiliza `fileReplacements` para seleccionar `environment.production.ts`
en producción. Servicios e interceptor comparten el destino validado.
Desde la raíz:

```powershell
npm.cmd start             # Desarrollo local
npm.cmd run build         # Archivos para uso local
npm.cmd run test:config   # Configuración e interceptor Angular real
# Cuando exista el dominio remoto, suministrar PSIQUE_API_URL y ejecutar:
npm.cmd run build:production
```

`PSIQUE_API_URL` es una variable **pública de compilación**: debe contener la URL
HTTPS de Express terminada en `/api`, sin credenciales, parámetros o fragmentos.
El build de producción falla si falta o es inválida; tampoco admite localhost.
La URL se incorpora al JavaScript mediante `define` de Angular: cambiarla requiere
recompilar, no editar servicios ni pantallas. La carpeta publicable será `www/browser`,
con reescritura SPA a `index.html` que aún debe configurarse en Render.

En esta etapa se probó el build con `https://api.example.test/api`, un dominio
reservado exclusivamente para verificar compilación, sin conectarse a él. Se
comprobó la ausencia de la API local en ese resultado y después se regeneró `www`
para desarrollo. No es una dirección de PSIQUE.

Express conserva el lanzador DPAPI, `.env` y puertos locales. Producción requiere
`NODE_ENV=production`, `PORT` del hosting y `FRONTEND_ORIGIN` HTTPS exacto;
selecciona `HOST=0.0.0.0`. La escucha pública se rechaza fuera de producción.
Se comprueban JWT, conexión, rol y esquema antes de abrir HTTP. SIGINT/SIGTERM
cierran HTTP y después el pool; tras 10 s se cierran conexiones HTTP que no terminaron.
No se modifican las transacciones ni las respuestas clínicas.

### Protecciones incorporadas

- CORS permite un origen exacto y GET/POST/PUT; el preflight acepta solamente
  Authorization y Content-Type. Lo no autorizado recibe 403. Sin cookies ni `*`.
- `express-rate-limit` 8 limita login a **30 solicitudes/15 minutos** y registro a
  **10/hora**, por IP o subred IPv6 /56, antes de SQL/Argon2. Cuenta solicitudes
  inválidas y correctas; el exceso recibe 429 genérico y Retry-After.
- `helmet` 8 aplica nosniff, protección de marcos, referrer-policy y CSP restrictiva
  a la API JSON. HSTS se activa en producción. No se cambió la CSP del sitio Angular.
- Todas las respuestas de Express, incluidos errores, tienen no-store, sin ETag
  ni X-Powered-By. Se conserva el límite JSON de 32 KB.
- `/health/live` responde sin SQL. `/health/ready` hace SELECT 1 y devuelve 200 o
  503 con un estado genérico, sin información personal o de infraestructura.
  Comparte el resultado 5 s y una sola consulta en vuelo; responde en aproximadamente
  1,5 s aun si PostgreSQL sigue esperando. El futuro health check será `/health/ready`.

Los contadores están en memoria: reiniciar Node los borra, no se comparten entre
réplicas y usuarios detrás de una misma IP comparten cupo. No resuelven ataques
distribuidos. El login y el 429 no distinguen si existe una cuenta. Se conserva el
409 previo del registro por email duplicado; no se rediseñó autenticación.

`TRUSTED_PROXY_CIDRS` admite solo IP/redes explícitas, nunca `true`, cantidad de
saltos ni `/0`. Vacío ignora encabezados de IP; detrás de Render varios clientes
podrían compartir el cupo del proxy. Antes de publicar hay que verificar su cadena
y encabezados saneados, y configurar las redes comprobadas. No se asumió un número
de saltos. Ver [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).

TLS PostgreSQL utiliza la misma política en el pool y los scripts. Producción exige
`verify-full`: certificado confiable, nombre correcto y TLS 1.2 como mínimo.
Se usan las CA de Node o `DATABASE_SSL_CA_FILE` si hay una CA propia confiable.
No se permiten excepciones de certificado ni parámetros SSL en la URL que puedan
sobrescribir esta política. Localmente se conserva `disable`.
Ver [produccion.env.example](backend/produccion.env.example) y [TLS en pg](https://node-postgres.com/features/ssl).

La [documentación de Render](https://render.com/docs/postgresql-creating-connecting)
distingue certificados internos autofirmados y externos administrados. La ruta
definitiva requiere comprobar la instancia real: evaluar la externa con acceso
de red restringido o una CA verificable si está disponible. No se desactivará la
validación para aceptar un certificado interno.

### Verificación local del 19/10/2026

| Comprobación | Resultado |
| --- | --- |
| Backend TypeScript | Compilación correcta. |
| Angular local y producción | Compilan; producción ensayada con dominio reservado, sin API local. |
| PostgreSQL | 123 resultados aprobados, incluidos 15 nuevos de seguridad/configuración. |
| SQLite histórico | 74 resultados aprobados; pruebas históricas sin modificaciones. |
| Configuración/interceptor Angular | 4 casos aprobados con el interceptor real local y producción. |
| Contratos clínicos | 186 respuestas HTTP por motor, sin diferencias. |
| TLS | Handshake local real rechazó certificado autofirmado y nombre incorrecto. |
| Arranque habitual | `start` y `dev` usan psique_app/psique; salud 200 y rutas sin JWT 401. |
| Desarrollo | Cero usuarios, pacientes, turnos y sesiones; sin ejemplos permanentes. |
| Navegador | No disponible en esta sesión; no se repitió el recorrido visual de 3C. |

La suite nueva se incluye en el lanzador `-Tarea probar`. El caso TLS usa OpenSSL
(el incluido con Git para Windows en esta PC), genera claves ficticias temporales
y las elimina al terminar. Las pruebas Angular usan Node y herramientas ya instaladas
por Angular, sin incorporar otro framework.

Se preservan `.env`, DPAPI, credenciales, pantallas, formularios, estilos, modelos,
navegación, criptografía de autenticación, lógica clínica, esquema, migración 001,
SQLite y respaldos. Dentro de `src/app` solo cambia `api.config.ts`.
Se comprobaron 61 archivos protegidos: 60 idénticos y únicamente ese cambio previsto.
La revisión de 119 archivos no encontró las tres contraseñas PostgreSQL reales ni
el secreto JWT. No se imprimieron sus valores para realizar la comprobación.

Quedan pendientes de Render: URLs, región, roles/permisos y compatibilidad del
esquema con el entorno administrado, ruta TLS y acceso de red PostgreSQL, proxy,
HTTPS real, cabeceras del sitio estático, SPA, señales/reinicios, backups operativos
y recorrido visual completo. No se creó Blueprint ni workflows de despliegue.
Los detalles técnicos están en [POSTGRESQL.md](backend/POSTGRESQL.md#etapa-4b-configuración-local-y-preparación-de-render).

### Conceptos para la defensa oral

| Concepto | Aplicación en PSIQUE |
| --- | --- |
| Desarrollo / producción | Local permite programar; producción necesita dominios, HTTPS y configuración explícita. |
| Desplegar | Ejecutar permanentemente la API en el proveedor con sus variables privadas. |
| Variable de entorno | Valor externo al código; la URL Angular es pública, una contraseña del backend es secreta. |
| Interfaz de escucha | 127.0.0.1 recibe desde esta PC; 0.0.0.0 permite que llegue el proxy del hosting. |
| HTTPS / TLS | HTTPS protege HTTP mediante TLS; PostgreSQL también usa TLS en su propia conexión. |
| Certificado | Comprobar confianza y nombre del servidor; cifrar sin verificar no alcanza. |
| CORS | Regula JavaScript del navegador; no sustituye JWT ni controla clientes como curl. |
| Rate limiting / 429 | Limita solicitudes repetidas; 429 pide esperar antes de reintentar. |
| Cabeceras | Indican al navegador cómo interpretar, restringir y almacenar respuestas. |
| Reverse proxy | Recibe HTTPS y reenvía a Express; sus encabezados requieren una confianza verificada. |
| Liveness / readiness | El proceso responde / el servicio puede atender con su dependencia disponible. |
| Secretos | DPAPI local y variables privadas futuras del hosting; nunca en el JavaScript Angular. |

## Recorridos de la aplicación

### Registro, login y logout

**Crear cuenta** solicita email, contraseña y repetición. El email se normaliza a minúsculas y sin espacios externos; no puede repetirse. La contraseña tiene entre 12 y 128 caracteres y ambas entradas deben coincidir. Las contraseñas no se recortan ni cambian a minúsculas. Angular ayuda a completar el formulario y Express vuelve a comprobar todos los campos.

Después del registro se vuelve a Login. **Iniciar sesión** verifica las credenciales y abre Inicio. Allí se muestra el email de la cuenta y **Cerrar sesión**. Una cuenta nueva comienza con todos sus contadores en cero; los datos de otra cuenta no se importan ni aparecen por compartir el navegador.

La sesión dura **una hora**. El token se guarda en `sessionStorage`, por pestaña: sobrevive a recargas y se elimina al cerrar sesión. El cierre habitual de la pestaña descarta ese almacenamiento, aunque un navegador puede restaurarlo al recuperar una sesión. No se guardan contraseñas. Al vencer el token o recibir un 401 de una solicitud privada se vuelve a Login. No hay renovación automática ni refresh tokens.

Cerrar sesión elimina las credenciales locales y destruye el contenedor de pantallas privadas, incluida la caché de navegación de Ionic. La próxima cuenta vuelve a consultar sus datos. El logout es local: un token que hubiera sido copiado sigue siendo válido ante la API hasta su vencimiento. Esta etapa no incorpora una lista de revocación.

También se retira cualquier modal abierto de Inicio. Ionic mueve esos elementos fuera del contenedor de la página; por eso Inicio los elimina al destruirse, evitando que un listado de cobros u horarios permanezca visible sobre Login.

### Inicio

Las cuatro tarjetas completas se pueden seleccionar con mouse, teclado o pantalla táctil. Sus cantidades se consultan al entrar a Inicio.

| Tarjeta | Qué cuenta | Destino |
| --- | --- | --- |
| **Pacientes activos** | Pacientes cuyo estado es `Activo`, sin distinguir mayúsculas. | Listado de Pacientes, que incluye todos los estados de tratamiento. |
| **Sesiones de la semana** | Sesiones marcadas como `Realizada`, con fecha de sesión dentro de la semana actual. | Histórico semanal con fecha, horario, paciente y acceso al detalle. |
| **Pendientes de cobro** | Sesiones realizadas cuyo total cobrado es menor que sus honorarios, cualquiera sea su fecha. | Modal con cada sesión y su saldo pendiente; seleccionarla abre el detalle. |
| **Horarios disponibles** | Horarios libres que todavía no pasaron, dentro de la semana actual. | Modal con fecha y hora; seleccionarlos abre Agendar sesión. Incluye acceso para cargar otro horario. |

La semana comienza el **lunes** y termina el **domingo**, según el calendario de **Buenos Aires**. No se mantiene una semana fija ni contadores de ejemplo. Cero representa que no hay registros que cumplan la condición; los estados vacíos explican cómo continuar.

### Pacientes: crear, consultar y editar

**Pacientes → Crear paciente** abre un formulario para cargar identificación, tratamiento, motivo de consulta y Post-it. Los valores iniciales son estado `Activo`, modalidad `Presencial`, frecuencia `Semanal` e inicio del tratamiento en la fecha actual de Buenos Aires. El día y horario habitual, la próxima sesión y las notas pueden quedar sin definir.

La frecuencia usa un selector con **Semanal**, **Quincenal** y **Mensual**, tanto en el alta como en la edición. Las opciones permanecen visibles al abrirlo aunque ya haya una frecuencia seleccionada; una frecuencia personalizada de un registro anterior se conserva al editarlo.

Se propone un código disponible, por ejemplo `P-001`. La sugerencia no reserva ese código. Puede personalizarse o dejarse vacío para generar uno al guardar. Si otro registro ya lo ocupa, el formulario conserva lo escrito y muestra el conflicto.

**Crear paciente** guarda el alta y abre su ficha. **Cancelar** vuelve al listado sin crear registros. En las tarjetas siguen apareciendo la próxima sesión, cuando existe, y la fecha de creación.

Desde una ficha, **Editar ficha** permite modificar diez datos: código, modalidad, estado, próxima sesión, frecuencia, día habitual, horario habitual, inicio del tratamiento, motivo de consulta y Post-it. **La fecha de creación se muestra como información y no se puede editar**. El servidor la asigna al crear y rechaza los intentos de cambiarla por la API.

Los formularios trabajan sobre un borrador. Guardar envía los datos a la API; Cancelar descarta cambios no enviados. Los errores de validación, duplicados o conexión conservan el borrador. Mientras una solicitud está en curso se bloquean los botones de guardado para evitar duplicarla.

### Agenda y agendamiento

Agenda abre la semana actual y permite recorrer **Anterior**, **Esta semana** y **Siguiente**. Cada día muestra sus horarios. Un día sin registros no significa que tenga horarios ofrecidos: primero se agregan mediante **Agregar horario disponible**, indicando una fecha y hora futuras.

Un horario disponible puede abrirse desde Agenda o desde la tarjeta de Inicio. **Agendar sesión** permite elegir un paciente existente, la modalidad de esa sesión y sus honorarios en ARS. Guardar ocupa el horario y abre el detalle de la sesión creada. No pueden coexistir dos sesiones del mismo profesional para la misma fecha y hora.

Si el paciente aún no existe, **Crear paciente** dentro de Agendar sesión conserva la fecha, hora, modalidad e importe elegidos. El formulario muestra ese contexto y su botón pasa a ser **Crear paciente y agendar**. El backend realiza ambas operaciones en una misma transacción: si el horario se ocupó o algún dato no es válido, no queda un paciente creado sin la reserva solicitada. Cancelar vuelve al agendamiento con el contexto conservado.

En ese recorrido el **horario habitual** del paciente se completa con la hora seleccionada y queda grisado, sin permitir editarla durante el alta. Se incluye igualmente al guardar la ficha. Al crear un paciente directamente desde Pacientes, el horario habitual sigue siendo opcional y editable.

Al agendar se actualiza la etiqueta de próxima sesión del paciente con su primera sesión programada futura. Cambiar los datos habituales desde la ficha no modifica las fechas, horarios ni modalidades de las sesiones que ya se agendaron. La modalidad habitual del tratamiento y la modalidad de una sesión son datos distintos.

Los horarios ya pasados no pueden reservarse desde Agendar sesión. En cambio, la edición permite corregir la fecha de una sesión ya registrada, incluso en el pasado. Al cambiarla de fecha u hora, el horario anterior queda `Liberado`; puede volver a reservarse si es futuro. Todavía no hay un recorrido de cancelación.

### Sesiones realizadas e histórico semanal

Toda sesión agendada comienza como **Programada**. Desde su detalle se puede seleccionar **Marcar como realizada** cuando llegó su horario. Esta acción confirma que efectivamente ocurrió.

Que pase la hora no cambia automáticamente su estado: una sesión que no se confirmó continúa programada y no aparece en el histórico de realizadas ni en pendientes de cobro. El histórico usa la fecha de la sesión, no la fecha en que se presionó el botón. Por ejemplo, confirmar hoy una sesión de la semana anterior no aumenta el contador de la semana actual.

La pantalla **Sesiones de la semana** abre las realizadas de lunes a domingo de la semana actual. **Anterior** permite consultar semanas pasadas, **Siguiente** avanzar hasta la actual y **Esta semana** regresar a ella. La semana elegida queda en la URL (`/sesiones?fecha=YYYY-MM-DD`) y se conserva al abrir un detalle, volver o recargar. Seleccionar una sesión abre su detalle; desde allí también se puede acceder a la ficha del paciente. El contador de Inicio siempre corresponde a la semana actual.

### Edición completa de una sesión

El detalle se presenta inicialmente en modo lectura. **Editar sesión** abre un borrador con paciente, fecha, horario, modalidad, estado, honorarios y total cobrado. **Guardar cambios** confirma todo junto y **Cancelar** descarta el borrador sin escribir en la base. El identificador interno de la sesión se conserva y el saldo se calcula a partir de los importes.

También permite escribir un **Resumen de la sesión** opcional, de hasta **100 caracteres**, sobre lo tratado. El formulario muestra un contador y recomienda evitar nombres reales y datos sensibles. El texto se guarda con la sesión y se muestra en su detalle. Dejarlo vacío permite retirarlo; cancelar conserva lo anterior. El límite se verifica en Angular, Express y PostgreSQL. Las sesiones anteriores comienzan sin resumen, conservando sus fechas, honorarios y cobros.

Al reprogramar, el backend utiliza el horario de destino si está libre o lo crea si no existía. Si otra sesión lo ocupa, muestra un conflicto y mantiene intactos los registros y el borrador. Sesión, turno de destino, liberación del anterior y etiquetas de próxima sesión de los pacientes afectados se actualizan dentro de la misma transacción. No se puede guardar una sesión futura como realizada; cambiar su estado a Programada la retira del histórico y de pendientes de cobro.

### Honorarios y cobros

El detalle muestra **Honorarios**, **Total cobrado** y **Saldo pendiente** como información de lectura. Para modificarlos se utiliza **Editar sesión**, junto con el resto de sus datos. No hay un formulario separado de honorarios ni una lista de movimientos individuales de pago.

Por ejemplo, si los honorarios son ARS 25.000 y ya se recibieron ARS 10.000, el saldo es ARS 15.000. Al recibir los ARS 15.000 restantes, se ingresa **25000** como total cobrado, porque ese campo representa la suma acumulada. Una sesión realizada desaparece de pendientes al quedar sin saldo.

Los importes se presentan en pesos argentinos y se guardan como **centavos enteros** para evitar errores de representación decimal. Se admiten entre 0 y 999.999.999 centavos (ARS 9.999.999,99), con hasta dos decimales en los formularios. Al escribir, se usa coma o punto como separador decimal y se omiten separadores de miles. El total cobrado no puede superar los honorarios. Las sesiones programadas pueden tener importes registrados, pero solo las realizadas con saldo positivo integran los pendientes de cobro.

No se inventan montos ni se generan sesiones por el paso del tiempo. Los honorarios se cargan al reservar o desde el detalle.

## Datos y validaciones

| Campo del paciente | Regla |
| --- | --- |
| `codigo` | Entre 1 y 12 caracteres; comienza con letra ASCII o número y admite luego letras ASCII, números, guion y guion bajo. Único dentro de la cuenta del profesional, sin distinguir mayúsculas. `nuevo` está reservado, también con otra capitalización. En el alta puede omitirse o estar vacío para generación automática. |
| `modalidad` | `Presencial` o `Virtual`. |
| `estado` y `frecuencia` | Textos obligatorios de hasta 40 caracteres cada uno. |
| `proximaSesion` | `null` o texto de hasta 30 caracteres. Es la etiqueta breve de la tarjeta. |
| `diaHabitual` | `null` o uno de los siete nombres de días en español. |
| `horarioHabitual` | `null` o una hora válida de 24 horas, con formato `HH:mm`. |
| `fechaCreacion` | Fecha `YYYY-MM-DD`, asignada por el servidor y conservada durante las ediciones. |
| `fechaInicioTratamiento` | Fecha de calendario válida `YYYY-MM-DD`, editable. |
| `motivoConsulta` | Texto de hasta 3000 caracteres; puede quedar vacío. |
| `postIt` | Texto de hasta 300 caracteres; puede quedar vacío. |

Usá alias o códigos y evitá nombres reales como identificador. El código aparece en las fichas, listados, agenda y URLs. `PA-01` y `ab_2` cumplen el formato; `Ana Pérez`, `-P001` y `nuevo` no. `PA-01` y `pa-01` no pueden identificar a pacientes diferentes dentro de una cuenta. Dos profesionales sí pueden usar el mismo código para sus respectivos pacientes.

El backend valida nuevamente todas las solicitudes: tipos, campos permitidos, longitudes, fechas reales, importes y relaciones entre registros. Recorta espacios externos de los textos, pero no trunca contenido para hacerlo entrar en un límite. Las respuestas de error usan `{ "mensaje": "..." }`.

Cambiar un código actualiza al paciente y sus referencias en horarios y sesiones dentro de una transacción. Si algo falla, PostgreSQL revierte el conjunto. La fecha de creación y los datos de las sesiones se conservan. Las pantallas renuevan sus consultas al entrar para mostrar lo guardado.

## Arquitectura y organización

```text
Pantalla de Ionic + Angular
        ↓ formulario o consulta
Servicio de Angular → HttpClient → interceptor
        ↓ HTTP: GET / POST / PUT + Bearer en rutas privadas
Express → middleware JWT → validación → SQL filtrado por profesional
        ↓ pool pg → PostgreSQL (psique)
        ↓ JSON
Estado del componente / Observable → plantilla
```

El navegador muestra la interfaz; el backend aplica las reglas y accede a PostgreSQL mediante el pool. Una respuesta correcta confirma un guardado persistido. Los componentes muestran errores de carga o guardado y no reemplazan silenciosamente una API caída con datos de ejemplo.

```text
APP-PSIQUE/
├── src/
│   ├── main.ts                   Inicio de Angular
│   ├── global.scss               Estilos globales e Ionic
│   └── app/
│       ├── app.component.*       Contenedor raíz con RouterOutlet
│       ├── app.config.ts         Proveedores y configuración regional
│       ├── app.routes.ts         Rutas con carga de pantallas por demanda
│       ├── api.config.ts         URL base de la API
│       ├── models/               Paciente, turno, sesión y resumen
│       ├── services/             Acceso HTTP a la API
│       ├── auth/                 Login, Registro, guard e interceptor
│       ├── espacio-privado/      Pantallas internas y navegación inferior
│       ├── shared/               Estilos y funciones compartidas
│       ├── inicio/               Cuatro tarjetas y modales
│       ├── pacientes/            Listado y acceso al alta
│       ├── paciente-crear/       Alta independiente o con reserva
│       ├── paciente-detalle/     Ficha y edición
│       ├── agenda/               Semana, días y alta de horarios
│       ├── agendar/              Asignación de un horario
│       ├── sesiones/             Histórico por semanas
│       └── sesion-detalle/       Datos, realización y cobros
├── backend/
│   ├── src/
│   │   ├── server.ts             Configuración e inicio del servidor
│   │   ├── app.ts                Persistencia SQLite histórica
│   │   ├── api.ts                Rutas y respuestas HTTP compartidas
│   │   ├── reglas-api.ts         Validaciones y reglas compartidas
│   │   ├── app-postgres.ts       API PostgreSQL del servidor habitual
│   │   ├── auth.ts               Registro, hashing, JWT y middleware
│   │   ├── auth-postgres.ts      Consultas de autenticación PostgreSQL
│   │   ├── models.ts             Contratos JSON de la API
│   │   ├── validar-paciente.ts   Validación de fichas
│   │   ├── calendario.ts         Fechas, semana y reloj de Buenos Aires
│   │   └── db/
│   │       ├── database.ts       Apertura y esquema con propietarios
│   │       ├── postgres.ts       Pool PostgreSQL y disponibilidad
│   │       ├── consultorio-postgres.ts  Consultas y transacciones de negocio
│   │       └── seed.ts           Ejemplos explícitos solo para pruebas
│   ├── test/                     Pruebas y fixtures temporales
│   ├── test-postgres/            Esquema, migraciones, autenticación y API
│   ├── data/psique-profesionales.sqlite  Base local de cuentas; no se versiona
│   ├── dist/                     JavaScript compilado del backend
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── .env.example
└── www/                          Aplicación web compilada
```

### Frontend

Los componentes son `standalone`: cada pantalla declara las dependencias que usa. `app.routes.ts` registra `/inicio`, `/pacientes`, `/pacientes/nuevo`, `/pacientes/:codigo`, `/agenda`, `/agenda/agendar`, `/sesiones` y `/sesiones/:id`. La ruta estática `pacientes/nuevo` se declara antes de `pacientes/:codigo`.

Esas rutas son hijas de `espacio-privado`, protegido con `canActivate` y `canActivateChild`. `/login` y `/registro` son públicas y quedan fuera del contenedor privado. El guard de acceso las redirige a Inicio cuando ya hay sesión.

La barra inferior mantiene Inicio, Pacientes y Agenda, con espacio propio para no cubrir el contenido. Las pantallas se organizan mediante `ion-router-outlet`, `RouterLink` y `NavController`. Ionic puede conservar una pantalla en memoria; `ionViewWillEnter` permite actualizar sus datos al regresar.

| Archivo o grupo | Responsabilidad |
| --- | --- |
| `services/auth.service.ts` | Registro, login, logout, token en sessionStorage y vencimiento. |
| `auth/auth.interceptor.ts` | Agregar el Bearer a la API privada y tratar 401; descartar respuestas tardías de una sesión anterior. |
| `auth/auth.guard.ts` | Decidir la navegación entre pantallas públicas y privadas. |
| `espacio-privado/` | Conservar la navegación habitual de Ionic mientras hay sesión; destruirla al salir. |
| `services/pacientes.service.ts` | Consultar, sugerir códigos, crear pacientes y actualizar fichas. Solo transforma el 404 de una consulta individual en paciente inexistente. |
| `services/agenda.service.ts` | Consultar la semana que contiene una fecha. |
| `services/dashboard.service.ts` | Consultar cantidades calculadas por el backend. |
| `services/sesiones.service.ts` | Consultar sesiones e importes, marcar realizadas, consultar y crear horarios, y agendar. |
| `models/paciente.ts` | Modelo completo de paciente y datos de alta sin fecha de creación. |
| `models/turno.ts` | Horarios y estructura de la semana de Agenda. |
| `models/sesion.ts` | Sesiones, reserva y respuestas del histórico y disponibilidad. |
| `models/dashboard.ts` | Las cuatro cantidades del resumen. |
| `shared/tiempo.ts` | Fecha y hora del consultorio, desplazamiento de fechas y comprobación de horarios pasados. |
| `shared/importes.ts` | Conversión de texto en pesos a centavos, validación de formularios y conversión inversa. |
| `shared/pagina.scss` | Estilos comunes de las pantallas nuevas. |

Los formularios utilizan **Reactive Forms** con validadores y estados de carga/guardado. `HttpClient` devuelve Observables; las pantallas consumen sus resultados con `AsyncPipe` o suscripciones vinculadas a su ciclo de vida. `DatePipe` y `CurrencyPipe` presentan fechas e importes, con configuración regional argentina.

### Backend y persistencia

`server.ts` valida la configuración, espera `abrirPoolPostgres` y monta
`crearAppPostgres` antes de escuchar HTTP. Al detenerse deja terminar las solicitudes
y cierra el pool. `api.ts` define rutas y respuestas; `reglas-api.ts` comparte
validaciones. `db/consultorio-postgres.ts` contiene SQL parametrizado y transacciones.
`calendario.ts` mantiene Buenos Aires y un reloj inyectable para pruebas de negocio.

El esquema se gestiona mediante los archivos versionados de `migrations/` (001 inicial y 002 para el resumen de sesión). Sus tablas
funcionales son `usuarios`, `pacientes`, `turnos` y `sesiones`.
`pendienteCentavos` se calcula al consultar. `psique_app` tiene SELECT, INSERT
y UPDATE; no tiene permisos para crear, alterar o eliminar tablas.

Las escrituras toman un cliente del pool, ejecutan BEGIN y bloquean la fila del
profesional mediante SELECT FOR UPDATE. Paciente, turnos y sesiones se confirman
juntos con COMMIT; ante fallos se ejecuta ROLLBACK y se libera el cliente.
Al renombrar se difieren las dos referencias al paciente hasta confirmar.
Las claves compuestas con `usuarioId` conservan el propietario de las relaciones.

### SQLite conservado como referencia

`app.ts`, `db/database.ts`, `db/seed.ts`, las pruebas históricas y las bases
`data/psique.sqlite` y `data/psique-profesionales.sqlite` se conservan.
El servidor habitual no los abre ni genera datos a partir de ellos. Los respaldos
anteriores permanecen fuera del repositorio, en la carpeta local `PSIQUE/respaldos`.

Se eligió comenzar PostgreSQL vacío; no hay importador ni asignación automática
de registros anteriores. Los datos nuevos de PostgreSQL **no aparecen en SQLite**.
El procedimiento para recuperar el servidor anterior está en
[POSTGRESQL.md](backend/POSTGRESQL.md#recuperar-el-arranque-sqlite-anterior).

## Autenticación y separación por profesional

**Autenticación** responde «¿Quién sos?»: el login comprueba la contraseña y el middleware verifica el token de cada solicitud. **Autorización** responde «¿A qué datos tenés permiso de acceder?»: las consultas SQL usan la identidad verificada para leer o modificar únicamente sus registros. El guard de Angular mejora la navegación; no puede reemplazar ninguno de esos controles del servidor.

### Usuarios y hashing de contraseñas

| Columna de `usuarios` | Propósito |
| --- | --- |
| `id` | Identificador interno numérico, generado por PostgreSQL. |
| `email` | Email normalizado, único sin distinguir mayúsculas. |
| `passwordHash` | Resultado de Argon2id; nunca se devuelve en la API. |
| `fechaCreacion` | Fecha de alta asignada por el servidor. |

Hashear una contraseña significa obtener una representación para verificarla sin guardar el texto original. Se utiliza **Argon2id**, mediante la biblioteca `argon2`, con una sal aleatoria generada por la biblioteca y sus parámetros de costo predeterminados. El hash incluye algoritmo, parámetros y sal necesarios para verificarlo: la sal no es una contraseña ni necesita ser secreta.

Un hash no es un cifrado reversible: no hay una clave que permita recuperar la contraseña original. En el login, `argon2.verify` comprueba la candidata contra el hash almacenado. Quien obtuviera los hashes podría intentar adivinar contraseñas; el costo de Argon2 dificulta cada intento y las contraseñas largas siguen siendo necesarias. El JWT usa un secreto diferente: ese secreto firma tokens, no descifra contraseñas.

Antes de elegir la dependencia se comprobó el entorno **Node 24.14.1 / Windows x64**, el rango `engines` publicado y el soporte de la biblioteca; también se ejecuta una prueba real de hash y verificación en ese entorno. `argon2` publica binarios para Windows x64 y documenta el uso de Argon2id. La firma y verificación JWT se delegan en `jose`, compatible con los módulos ESM del backend. Las versiones exactas quedan fijadas en `backend/package-lock.json`. Referencias: [node-argon2](https://github.com/ranisalt/node-argon2), [jose](https://github.com/panva/jose).

El registro acepta únicamente `email`, `password` y `repetirPassword`. Devuelve los datos públicos de la cuenta, sin iniciar sesión automáticamente. El login acepta `email` y `password`; un email inexistente y una contraseña incorrecta reciben el mismo mensaje. Ni las contraseñas, ni los hashes, ni los tokens se escriben en los logs de la aplicación.

### JWT y middleware de Express

Un **JWT** es un conjunto de datos JSON firmado. Express lo genera después de verificar las credenciales. Incluye `sub` (ID del profesional), `iat` (emisión), `exp` (vencimiento), `iss` (emisor) y `aud` (destinatario). No incluye historias clínicas, pacientes ni contraseñas. Está firmado con **HS256** y vence a los **3600 segundos**. La firma detecta modificaciones; no cifra su contenido, que se puede leer.

El cliente recibe `{ token, usuario, expiraEn }`. En cada solicitud privada envía `Authorization: Bearer <token>`. El middleware restringe el algoritmo a HS256 y verifica firma, emisor, destinatario, vencimiento y sujeto, además de comprobar que el usuario sigue existiendo. Solo entonces deja su ID en `res.locals.usuarioId` y permite continuar al endpoint. Un token ausente, inválido o vencido produce **401**.

Las rutas de registro y login se montan antes del middleware; el resto de `/api` queda detrás de él. El secreto proviene de `JWT_SECRET` y se valida al iniciar. El navegador jamás recibe ese secreto. Se conserva CORS para el origen local configurado; CORS no autentica ni aísla profesionales.

### AuthService, interceptor y guard de Angular

`AuthService` reúne registro, login, logout, almacenamiento y vencimiento del token. Los servicios existentes siguen usando `HttpClient` sin construir headers manualmente. El interceptor reconoce las solicitudes a la URL de nuestra API y les agrega el Bearer cuando son privadas; no envía el token a otros destinos ni a registro/login. Un 401 invalida la sesión correspondiente y redirige a Login.

El guard protege Inicio, Pacientes, altas, fichas, Agenda, Agendar sesión, histórico y detalles. Abrir una URL privada o usar Atrás sin una sesión vigente conduce a Login. Decodificar el vencimiento en Angular sirve para la experiencia de uso: **el cliente no valida la firma ni decide el propietario**. Express realiza la comprobación real en cada llamada.

La raíz usa un `RouterOutlet` de Angular para separar pantallas públicas y el contenedor privado. Dentro de ese contenedor se mantiene el `ion-router-outlet` y la barra inferior. Al salir se destruye el contenedor, evitando reutilizar fichas, formularios o listados de una cuenta anterior.

### Propiedad de los registros

| Tabla | Clave y relación con el profesional |
| --- | --- |
| `pacientes` | Clave compuesta por `usuarioId` y `codigo`; un código solo debe ser único dentro de esa cuenta. |
| `turnos` | Clave compuesta por `usuarioId`, `fecha` y `horario`; referencia al paciente del mismo profesional si está asignado. |
| `sesiones` | ID interno y `usuarioId`; horario único por profesional y claves foráneas compuestas hacia su paciente y horario. |

Dos profesionales pueden usar `P-001` o atender el mismo día a las 15:00 sin conflicto. El ID de sesión no concede acceso: al buscarlo también se exige el `usuarioId` del token. Las consultas individuales, listados, códigos sugeridos, uniones SQL, validaciones de disponibilidad, cambios de código, reprogramaciones, cobros y estadísticas aplican ese mismo criterio.

Un recurso ajeno se trata como inexistente y responde **404**, sin confirmar que otra cuenta lo tiene. El backend no toma el propietario del formulario, la URL ni un parámetro `userId`: lo obtiene exclusivamente del JWT validado. Los cuerpos con campos desconocidos se rechazan. Los errores por código duplicado u horario ocupado se evalúan dentro de la propia cuenta.

### RECORRIDO COMPLETO DEL LOGIN

```text
Login de Angular: email y contraseña
    ↓ POST /api/auth/login
Express valida el formato y busca el email normalizado
    ↓
argon2.verify compara la contraseña con passwordHash
    ↓ si es correcta
jose firma un JWT con el ID y vencimiento de una hora
    ↓ respuesta sin hash ni contraseña
AuthService guarda token y usuario en sessionStorage
    ↓ guard permite entrar a Inicio
HttpClient solicita /api/dashboard
    ↓ interceptor agrega Authorization: Bearer <token>
Middleware de Express verifica JWT y existencia del usuario
    ↓ res.locals.usuarioId
SQL cuenta únicamente los registros de ese profesional
    ↓ JSON con sus cantidades
Angular muestra el Dashboard
```

Para defenderlo oralmente: **el login acredita la identidad una vez; el middleware comprueba el token en cada llamada; el filtro por propietario limita los datos en cada operación**. Cambiar una URL o quitar el guard del navegador no elimina los controles de Express y PostgreSQL.

## API HTTP

Las rutas funcionales parten de `/api`. Las consultas correctas, el login y las actualizaciones devuelven `200`; las altas y el registro, `201`. Los errores usan `400` para datos inválidos, `401` para credenciales incorrectas o token ausente/inválido/vencido, `403` para CORS rechazado, `404` para un recurso inexistente o ajeno, `409` para email o código duplicado u horario ocupado, `413` para un JSON que supera 32 KB, `429` para exceso de intentos de acceso, `500` para un fallo interno y `503` cuando PostgreSQL no está disponible. Fuera de `/api`, `/health/live` y `/health/ready` son comprobaciones técnicas públicas sin datos personales.

Dentro de `/api`, solo estos endpoints son **públicos** (health está fuera de esa ruta):

| Método y ruta | Cuerpo y respuesta |
| --- | --- |
| `POST /auth/registro` | `{ email, password, repetirPassword }` → `{ usuario: { id, email, fechaCreacion } }`. |
| `POST /auth/login` | `{ email, password }` → `{ token, usuario: { id, email, fechaCreacion }, expiraEn: 3600 }`. |

Los siguientes endpoints son **privados** y requieren el Bearer; todos operan dentro de la cuenta autenticada:

| Método y ruta | Datos o comportamiento |
| --- | --- |
| `GET /pacientes` | Arreglo de pacientes, ordenado por código. |
| `GET /pacientes/siguiente-codigo` | `{ codigo }` sugerido; no lo reserva. |
| `GET /pacientes/:codigo` | Ficha de un paciente. |
| `POST /pacientes` | Recibe `{ paciente, turno? }`; devuelve `{ paciente, sesion }`. La sesión es `null` en un alta independiente. |
| `PUT /pacientes/:codigo` | Reemplaza los datos editables de la ficha identificada por el código anterior. `fechaCreacion` puede omitirse o conservar su valor; no puede cambiar. |
| `GET /sesiones/semana?fecha=YYYY-MM-DD` | `{ desde, hasta, sesiones }` realizadas de la semana que contiene la fecha; sin fecha usa la actual. |
| `GET /sesiones/pendientes` | Arreglo de sesiones realizadas con saldo, de cualquier fecha. |
| `GET /sesiones/:id` | Datos e importes de una sesión. |
| `POST /sesiones` | Recibe `{ fecha, horario, codigoPaciente, modalidad, importeCentavos }` y reserva un horario existente futuro. Devuelve la sesión. |
| `POST /sesiones/:id/realizar` | Confirma que ocurrió una sesión cuyo horario ya llegó. Devuelve la sesión realizada. |
| `PUT /sesiones/:id` | Recibe `{ fecha, horario, codigoPaciente, modalidad, estado, importeCentavos, pagadoCentavos }` y `resumen` opcional, actualiza la sesión y sus horarios atómicamente y devuelve el mismo ID con saldo calculado. Omitir `resumen` conserva el anterior; enviarlo vacío lo borra. |
| `GET /horarios/disponibles?fecha=YYYY-MM-DD` | `{ desde, hasta, horarios }` futuros de la semana que contiene esa fecha. Sin fecha usa la semana actual. |
| `GET /horarios/:fecha/:horario` | Horario individual, estado, paciente, modalidad y `sesionId`, si tiene sesión. |
| `POST /horarios` | Recibe `{ fecha, horario }` y crea un horario disponible futuro. |
| `GET /agenda?fecha=YYYY-MM-DD` | Semana de siete días con sus horarios; sin fecha usa la actual. |
| `GET /dashboard` | `{ pacientesActivos, sesionesSemana, pendientesCobro, horariosDisponibles }` calculado. |

En el alta, `paciente` contiene los diez campos editables; `codigo` es opcional y `fechaCreacion` no se debe enviar. Si se incluye `turno`, requiere fecha, horario, modalidad e importe en centavos. Por ejemplo:

```json
{
  "paciente": {
    "codigo": "PA-01",
    "modalidad": "Virtual",
    "estado": "Activo",
    "proximaSesion": null,
    "frecuencia": "Semanal",
    "diaHabitual": null,
    "horarioHabitual": null,
    "fechaInicioTratamiento": "2026-10-05",
    "motivoConsulta": "",
    "postIt": ""
  }
}
```

El ejemplo es un alta independiente. Para asociarla a un horario se agrega, al mismo nivel de `paciente`, un objeto como `"turno": { "fecha": "YYYY-MM-DD", "horario": "15:00", "modalidad": "Virtual", "importeCentavos": 2500000 }`, reemplazando la fecha por una futura con un horario disponible real.

CORS permite los métodos GET, POST y PUT para el origen configurado. Controla el acceso desde el navegador; no sustituye la autenticación. No existen rutas de eliminación ni de cancelación de sesiones en esta etapa.

## Alcance pendiente

La aplicación funciona localmente con PostgreSQL, autenticación y datos separados por profesional. Quedan para otras etapas el despliegue con HTTPS, la operación de copias de seguridad, la recuperación de contraseña y la verificación de email. No se incorporaron Google Sign-In, MFA, roles de profesionales, refresh tokens, biometría ni bloqueo por inactividad. Tampoco incluye cancelaciones, recurrencia automática ni movimientos individuales de pago. El destino móvil y la distribución instalable continúan pendientes; SQLite se conserva como referencia histórica.

## Archivos de configuración de la raíz

### `angular.json`

Es la configuración que utiliza Angular CLI para compilar y servir el proyecto
`psique`. Indica que el código está en `src`, que comienza en `src/main.ts` y que
usa `src/index.html` como página base. También selecciona `src/global.scss` para
los estilos generales y `tsconfig.app.json` para las reglas de TypeScript.

La tarea `build` usa `@angular/build:application` y tiene `outputPath: "www"`:
por eso los archivos compilados se generan en esa carpeta. Su configuración
predeterminada es `development`. La configuración explícita `production` reemplaza
el entorno, optimiza y agrega identificadores de contenido (`outputHashing: "all"`).
Sus `budgets` limitan el tamaño inicial y los estilos. `build:production` valida
e incorpora la URL pública mediante `define`, una opción del compilador Angular.

La tarea `serve` inicia el servidor de desarrollo. Usa la configuración
`development`, que desactiva la optimización y activa los mapas de código
(`sourceMap`) para facilitar la depuración del código original.

### `ionic.config.json`

Identifica el proyecto ante las herramientas de Ionic: su nombre es `PSIQUE` y
su tipo es `angular-standalone`. Ese tipo corresponde al uso de componentes de
Angular que declaran sus propias dependencias en `imports`, sin necesitar un
módulo `NgModule` por pantalla.

### `package.json`

Describe el proyecto y declara los comandos y paquetes que utiliza npm.

- `scripts.start`: ejecuta `ng serve --host 127.0.0.1 --port 4200`; abre el servidor
  local de desarrollo mediante `npm.cmd start`.
- `scripts.build`: ejecuta `ng build`; genera la versión local mediante `npm.cmd run build`.
- `scripts.build:production`: exige `PSIQUE_API_URL` HTTPS y genera el sitio optimizado.
- `scripts.test:config`: prueba configuración e interceptor Angular real con Node.
- `dependencies`: paquetes que usa la aplicación, como Angular, Ionic e Ionicons.
- `devDependencies`: herramientas para trabajar y compilar, como Angular CLI,
  Angular Build y TypeScript.
- `engines`: declara el rango de versiones de Node.js admitidas por el proyecto.
- `private: true`: evita publicar accidentalmente este proyecto como paquete en npm.
  No configura la privacidad ni la autenticación de los usuarios de PSIQUE.

Las versiones declaradas pueden ser rangos: por ejemplo, `~5.9.3` permite
actualizaciones de corrección dentro de TypeScript 5.9.

### `package-lock.json`

npm genera y actualiza este archivo al instalar o cambiar dependencias. Registra
las versiones exactas resueltas, incluidas las dependencias de otros paquetes,
junto con su origen y valores de integridad para comprobar las descargas.

Complementa a `package.json`: uno declara los paquetes y rangos aceptados; el
otro conserva la resolución concreta para reproducir la instalación. No se edita
a mano. Cuando coincide con `package.json`, `npm.cmd ci` permite instalar las
versiones registradas de forma reproducible, reemplazando `node_modules`.

### `tsconfig.json`

Contiene las reglas base del compilador TypeScript y del compilador de Angular.

- `rootDir: "./src"`: establece la carpeta raíz del código fuente y su organización
  relativa para la salida de TypeScript.
- `outDir: "./dist/out-tsc"`: define un destino base para la salida de TypeScript.
  Puede ser reemplazado por una configuración que herede de esta.
- `strict` y otras comprobaciones: ayudan a detectar errores de tipos, retornos
  incompletos y otros problemas antes de ejecutar la aplicación.
- `target: "ES2022"` y `lib`: seleccionan características de JavaScript y los tipos
  disponibles, incluidos los del navegador (`dom`).
- `module: "preserve"` y `moduleResolution: "bundler"`: preparan los módulos y sus
  importaciones para las herramientas que empaquetan la aplicación.
- `angularCompilerOptions.strictTemplates`: comprueba también los tipos usados
  en los HTML de los componentes.

`outDir` no decide la carpeta final que se muestra al usuario: Angular genera esa
versión según `outputPath` en `angular.json`, que en PSIQUE es `www`.

### `tsconfig.app.json`

Adapta las reglas anteriores específicamente a la aplicación. `extends` hereda
`tsconfig.json` y `outDir: "./out-tsc/app"` reemplaza su destino base de TypeScript.

`files` indica `src/main.ts` como entrada; sus importaciones incorporan las demás
partes de la aplicación. `include` contempla archivos de declaraciones de tipos
`src/**/*.d.ts`. Por eso no hace falta agregar cada pantalla nueva a este archivo.
`types: []` evita incluir automáticamente declaraciones globales de paquetes de
tipos instalados; los tipos de los módulos que importamos siguen disponibles.

## Qué contiene la carpeta `www`

`www` es el resultado generado al ejecutar `npm.cmd run build` o `build:production`. Angular transforma
TypeScript, las plantillas HTML y los estilos SCSS en archivos que el navegador
puede cargar. La estructura de producción es:

```text
www/
├── browser/
│   ├── index.html
│   ├── main-<identificador>.js
│   ├── polyfills-<identificador>.js
│   ├── chunk-<identificador>.js
│   └── styles-<identificador>.css
├── 3rdpartylicenses.txt
└── prerendered-routes.json
```

Hay varios archivos `chunk-*.js`; el árbol muestra su patrón de nombre una sola
vez. Los identificadores y la cantidad de archivos pueden cambiar al compilar.
En desarrollo `main.js`, `polyfills.js` y `styles.css` no llevan hash; hay mapas de
código y no se genera el archivo de licencias de producción.

| Archivo o grupo | Qué contiene |
| --- | --- |
| `browser/index.html` | Página de entrada generada, con referencias al JavaScript y CSS compilados. |
| `browser/main-*.js` | Código que inicia la aplicación compilada. |
| `browser/polyfills-*.js` | Código de apoyo configurado para el entorno de ejecución; este proyecto incluye `zone.js`. |
| `browser/chunk-*.js` | Partes del código de la aplicación y sus bibliotecas, separadas por el empaquetador; algunas se cargan al navegar o cuando un componente las necesita. |
| `browser/styles-*.css` | Estilos globales e importaciones de Ionic procesados para el navegador. |
| `3rdpartylicenses.txt` | Textos de licencias de bibliotecas incluidas en la compilación. |
| `prerendered-routes.json` | Registro generado de rutas prerenderizadas. Actualmente contiene `"routes": {}`, sin páginas prerenderizadas. No contiene la API de Express. |

Los archivos de `www` no se editan a mano: una nueva compilación puede
reemplazarlos. Para cambiar una pantalla, modificamos `src` y volvemos a compilar
si necesitamos actualizar la versión de producción.

`npm.cmd start` trabaja con el código fuente y recompila los cambios mediante el
servidor de desarrollo; no depende de una compilación previa en `www`. Para mostrar
los archivos de producción se debe servir `www/browser` mediante un servidor web,
con redirección a `index.html` para rutas como `/pacientes`. No se debe abrir
`www/browser/index.html` con doble clic (`file://`), porque la aplicación necesita
cargarse por HTTP y resolver correctamente sus rutas y módulos.

## Verificación y recorrido de prueba

### Activación PostgreSQL — etapa 3C

El **14/10/2026** se activó PostgreSQL en el servidor habitual. Los comandos
`dev` y `start` se iniciaron con `psique_app`/`psique`, y se comprobó la conexión
real de ese proceso a PostgreSQL. Pasaron **108 resultados** de la suite
PostgreSQL (incluye ocho nuevos de arranque/cierre/persistencia) y **74 resultados**
de la suite histórica SQLite. Frontend y backend compilaron correctamente.

La persistencia se comprobó creando cuenta, paciente, horario y sesión en
`psique_test`, reiniciando Express y consultándolos desde una conexión nueva.
Desarrollo y pruebas quedaron vacíos. Se conservaron frontend, autenticación,
bases SQLite, respaldos y secreto JWT.

El **15/10/2026** se completó la integración con el frontend Angular real en el
navegador integrado de Codex, usando exclusivamente datos ficticios en
`psique_test`: registro, errores de acceso y duplicados, login, pacientes,
agenda, reserva, edición de sesión, cobro parcial, histórico, Dashboard,
aislamiento entre dos cuentas y logout. Se comprobó la persistencia tras
reiniciar Express y recargar el navegador, también desde una conexión SQL nueva.
Se revisaron escritorio (1280 px) y pantallas de 360 y 320 px, sin desbordamiento
horizontal en las vistas comprobadas ni errores JavaScript registrados.
Al terminar se retiraron solo los datos de esta prueba y se restauró el backend
habitual con `psique_app`/`psique`; ambas bases quedaron vacías. Detalles en
[POSTGRESQL.md](backend/POSTGRESQL.md#etapa-3c-postgresql-como-base-habitual).

### API PostgreSQL completa — etapa 3B

Verificación del **14/10/2026**: **100 resultados aprobados** en `test:postgres`
(incluye la comparación con SQLite) y **74 resultados aprobados** en la suite
SQLite existente. Backend y frontend compilaron correctamente.
El recorrido compartido comparó **186 respuestas HTTP por motor**: mismos estados,
mensajes y JSON después de normalizar únicamente IDs autogenerados.

Se comprobaron escrituras simultáneas, aislamiento, persistencia, rollback,
rechazo de `COMMIT`, espera de bloqueos limitada y recuperación de conexiones.
El Dashboard PostgreSQL obtiene sus cuatro cantidades desde una sola sentencia.
Fechas y horarios mantienen `YYYY-MM-DD` y `HH:mm`; centavos y cantidades son números.

Desde `backend`, con solo `TEST_DATABASE_URL` configurada de forma privada:

```powershell
npm.cmd run test:postgres:api
npm.cmd run test:postgres
```

En esta computadora también puede utilizarse el lanzador privado:

```powershell
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea probar-api
```

La API de pruebas se cierra automáticamente. No se conecta Angular a ella.
Desarrollo PostgreSQL permanece vacío y los datos ficticios se limpian únicamente
en `psique_test`, por instancia. Frontend, autenticación, migración 001, archivos
SQLite, respaldos y configuración local se conservaron. Los detalles, diferencias
entre motores y conceptos para la defensa están en [POSTGRESQL.md](backend/POSTGRESQL.md#etapa-3b-api-completa-aislada).

### Autenticación PostgreSQL preparada — etapa 3A

La verificación del **13/10/2026** aprobó **19 pruebas de autenticación PostgreSQL**,
**42 pruebas PostgreSQL en conjunto** y **74 resultados de la suite SQLite existente**.
Frontend y backend compilaron correctamente. Se verificaron conexión, recuperación
del pool, registros simultáneos, JWT y errores 503; desarrollo y pruebas quedaron
sin registros ficticios permanentes. La aplicación local sigue respondiendo y el
frontend, las rutas clínicas, las bases SQLite, los respaldos y el secreto JWT
conservaron sus archivos. Los detalles y comandos están en [POSTGRESQL.md](backend/POSTGRESQL.md).

### Autenticación y cuentas profesionales

La verificación finalizada el **10/10/2026** incluye compilación correcta del frontend y backend, sin advertencias del frontend, y **74 resultados aprobados del ejecutor de pruebas de Node** (69 casos y cinco contenedores). Se conservó la cobertura de pacientes, agenda, sesiones e importes, ahora atravesando el middleware real con JWT de prueba.

Las pruebas usan bases temporales. Cubren registro y email duplicado —incluidos intentos simultáneos—, hashes con sales distintas, login correcto e incorrecto, tokens vencidos o alterados, todos los endpoints privados sin token, aislamiento de listados y operaciones, contadores por profesional, códigos y horarios compartidos entre cuentas, claves foráneas y reversión de operaciones incompletas. Las bases anteriores se rechazan conservando sus bytes, esquema y datos.

La revisión específica de modales comprueba Cobros y Horarios al vencer y al cerrar sesión: Login queda sin contenido privado ni credenciales locales, el foco y Tab funcionan, y se puede volver a ingresar. Los datos de estas pruebas no se cargan en la base local del proyecto.

El recorrido integrado en navegador aprobó **51 comprobaciones** con dos cuentas: registro, duplicados, credenciales incorrectas, login, logout, rutas protegidas, recarga, cambio de cuenta y acceso directo a recursos ajenos. También se comprobaron los flujos existentes de alta y edición de pacientes, horarios, reserva independiente o con paciente nuevo, edición completa y realización manual de sesiones, histórico, saldos y Dashboard. Los formularios de acceso se revisaron en PC y anchos de 360 y 320 píxeles, sin desbordamiento horizontal ni excepciones JavaScript.

La base nueva del proyecto quedó vacía y lista para el registro del usuario. Se comprobó que los pacientes, turnos y sesiones de la base anterior coinciden con su respaldo, cuya integridad SQLite es correcta.

### Demostrar el aislamiento con dos profesionales

Usá emails ficticios como `profesional.a@example.test` y `profesional.b@example.test`, y elegí contraseñas de prueba de al menos 12 caracteres. No hay cuentas precargadas. Para la demostración, trabajá en la misma pestaña cerrando sesión entre cuentas, o en dos ventanas independientes.

1. Registrá A e iniciá sesión. Creá el paciente `SOLO-A`, agregá un horario futuro y agendalo. Anotá la URL del detalle de esa sesión. Revisá sus cantidades en Inicio.
2. Cerrá sesión. Intentá volver a una ficha usando Atrás o escribiendo `/pacientes/SOLO-A`: debe mostrarse Login, sin el contenido anterior.
3. Registrá B e iniciá sesión. Su listado, Agenda, histórico y Dashboard deben estar vacíos. Abrir la ficha de A o la URL de su sesión debe mostrar recurso no encontrado, sin detalles ajenos.
4. En B, creá su propio paciente `P-001` y un horario con la misma fecha y hora que usó A. Deben guardarse porque pertenecen a otra cuenta. Agendá ese paciente y observá los contadores de B.
5. Volvé a A y verificá que sus datos siguen iguales, sin el paciente ni la sesión de B. A también puede usar `P-001` sin conflictos con el código de B.
6. Para mostrar el control del backend, consultá `/api/pacientes` desde una herramienta HTTP sin Bearer: devuelve 401. Con el token de A, cambiar un ID por el de la sesión de B devuelve 404. Mandar `usuarioId` en el cuerpo no cambia el propietario: los campos extra se rechazan.

El mismo recorrido se puede usar para demostrar cobros: una sesión solo entra al histórico y a pendientes después de marcarla realizada cuando su horario ya pasó. Al editar el total cobrado cambian únicamente los saldos e indicadores de esa cuenta.

### Comprobaciones de etapas anteriores

Verificación completada el **05/10/2026**:

- Compilación del frontend y del backend correcta; frontend sin advertencias.
- Backend: **36 casos efectivos aprobados** (39 resultados al incluir los tres contenedores del ejecutor de Node), con bases SQLite temporales. Incluyen migración y persistencia, fecha de creación inmutable, reservas concurrentes, reversión completa ante fallos y límites del calendario de Buenos Aires.
- Navegador: **56 comprobaciones aprobadas**, con una API y una base temporales. Se verificaron los cuatro accesos de Inicio, altas independientes y con reserva, conflictos sin altas parciales, confirmación manual de sesiones, cobros y contadores, navegación entre semanas, recarga, errores y estados vacíos. También se comprobaron teclado y presentación en PC y anchos de 360 y 320 píxeles.
- Se respaldó la base local antes de actualizarla. La migración conservó sus pacientes y horarios originales, convirtió los turnos asignados en sesiones programadas sin inventar importes y mantuvo válidas las relaciones entre registros.

La ampliación del **06/10/2026** se comprobó con compilaciones correctas, **47 casos efectivos del backend** (51 resultados con cuatro contenedores) y **36 comprobaciones en navegador**. Cubren semanas anteriores y conservación de la selección, edición completa y cancelación, reprogramación atómica y conflictos, sincronización de saldos y estado, errores con borrador conservado y Quincenal en alta y edición. Las pantallas se revisaron en PC y anchos de 320 y 360 píxeles. Las pruebas automatizadas utilizaron bases temporales.

En la base anterior se agregó una sesión de ejemplo el 06/10/2026, después de respaldarla: paciente **P-001**, fecha **05/10/2026**, hora **10:00**, estado **Realizada**, honorarios **ARS 25.000** y total cobrado **ARS 0**. Ese registro permanece en el archivo conservado de la etapa anterior; no se importó a las cuentas nuevas. Reiniciar la aplicación no lo recrea.

Para recorrer la aplicación con datos propios de prueba:

Primero registrá una cuenta e iniciá sesión.

1. Abrí Pacientes y creá un paciente con un alias. Confirmá que aparece en el listado y que su ficha muestra la fecha de creación sin permitir editarla.
2. Editá algún dato, cancelá y comprobá que conserva su valor. Después guardá un cambio de código y revisá la ficha actualizada.
3. En Agenda, agregá un horario futuro y seleccioná **Agendar sesión**. Elegí el paciente, la modalidad y los honorarios; guardá y abrí el detalle.
4. Volvé a Inicio. El horario reservado ya no debe figurar entre los disponibles. Una sesión programada no incrementa todavía las sesiones realizadas ni los pendientes de cobro.
5. Agregá otro horario y usá **Crear paciente** desde el agendamiento. Revisá el contexto; **Crear paciente y agendar** debe guardar ambos registros y abrir la sesión. Cancelar el alta debe volver sin guardar ninguno.
6. Cuando haya llegado el horario de una sesión, marcala como realizada. Si pertenece a la semana actual debe figurar en el histórico; si tiene saldo, también en el modal de pendientes.
7. Abrí **Editar sesión**, registrá un cobro parcial y verificá el saldo; después completá el total acumulado y comprobá que desaparece de pendientes. Probá Cancelar y la edición del resto de los datos; un cambio de fecha u hora debe liberar el horario anterior.
8. Reiniciá frontend y backend y comprobá que los cambios siguen guardados. Recorré Agenda por semanas anteriores y siguientes para consultar las fechas correspondientes.

Los casos de prueba que necesitan fechas pasadas o cambios de reloj deben usar una base aislada y el reloj inyectable del backend; no hace falta cambiar el reloj de Windows ni alterar registros del consultorio. Las pruebas de errores deben comprobar que se muestran mensajes útiles y se conserva el borrador, sin confirmar un guardado que no ocurrió.
