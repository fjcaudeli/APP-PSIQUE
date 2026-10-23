# PSIQUE

Aplicación de seguimiento psicoterapéutico y administración de consultorio. Se desarrolla con **Ionic y Angular** en el frontend, **Node.js, Express y TypeScript** en la API, y **PostgreSQL 18.6** para la persistencia local.

La aplicación permite crear y editar pacientes, agendar sesiones desde un calendario navegable por semanas, confirmar que se realizaron y registrar sus honorarios y cobros. Inicio muestra seis accesos con contadores en un mosaico compacto de dos columnas; el primero reúne a los pacientes pendientes de agendar su próxima sesión.

La interfaz puede usarse en el navegador de una PC y se adapta a pantallas pequeñas. Cada profesional se registra e inicia sesión para acceder a sus propios pacientes, horarios, sesiones y estadísticas. La etapa 4B prepara configuración y seguridad para Render. Frontend, backend y PostgreSQL continúan ejecutándose localmente; el envío de correo utiliza el servicio externo Resend.

**Confirmación para cuentas nuevas y recuperación de contraseña.** Las migraciones 007 y 008 están aplicadas en `psique` y `psique_test`. Las cuentas anteriores conservan el acceso por la excepción autorizada; las nuevas requieren confirmar su email. El backend habitual funciona con PostgreSQL y ya carga la configuración privada de Resend. El proveedor aceptó el primer correo de prueba con HTTP 200 y el destinatario confirmó su recepción. Si falta configurar el proveedor en otra instalación, las altas nuevas y solicitudes de correo responden 503, sin simular envíos.

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
| `CORREO_PROVEEDOR` | Vacío hasta configurar el correo | Adaptador preparado: `resend` mediante HTTPS. Sin configuración, nuevas altas y solicitudes de correo responden 503; no se simulan envíos. |
| `CORREO_REMITENTE` | Sin valor predeterminado | Remitente autorizado por el proveedor. Se configura solo en el entorno privado. |
| `RESEND_API_KEY` | Sin valor predeterminado | Credencial privada de envío; nunca se incluye en Angular ni en archivos versionados. |
| `CORREO_DESTINATARIO_PRUEBA` | Vacío fuera de pruebas de correo | Limita el envío al email de la cuenta de Resend mientras se prueba sin dominio propio. No redirige los enlaces de otras cuentas. |
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
npm.cmd run test:config   # Configuración, interceptor y formularios Angular reales
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

También se retira el modal de cobros de Inicio al destruirse la pantalla, evitando que permanezca visible sobre Login.

### Inicio

Los seis mosaicos tienen el mismo tamaño compacto, en dos columnas y tres filas también en móvil, con título, icono y contador. Se pueden seleccionar con mouse, teclado o pantalla táctil. Las cantidades se consultan al entrar a Inicio; Notas y Sesiones agendadas se calculan reutilizando el listado privado de reservas futuras y en curso. Últimas sesiones cuenta los registros del listado privado de la última realizada de cada paciente.

| Tarjeta | Qué cuenta | Destino |
| --- | --- | --- |
| **Pendientes de agendar** | Pacientes activos sin sesiones futuras ni en curso. Cuenta pacientes, no sesiones. | Próximas sesiones, con la última sesión y opciones para reservar. |
| **Pacientes activos** | Pacientes cuyo estado es `Activo`, sin distinguir mayúsculas. | Listado exclusivo de activos, con acceso a la pantalla separada de no activos. |
| **Últimas sesiones** | Una última sesión marcada como `Realizada` por paciente con asistencia confirmada, sin límite de fecha. | Listado de la más reciente a la más antigua, con fecha, horario, paciente, saldo pendiente sobre honorarios y acceso al detalle. |
| **Pendientes de cobro** | Sesiones realizadas cuyo total cobrado es menor que sus honorarios, cualquiera sea su fecha. | Modal con cada sesión y su saldo pendiente; seleccionarla abre el detalle. |
| **Notas** | Próximas sesiones con Nota no vacía, sin duplicarla en el segundo bloque de un paciente. | Notas de las próximas sesiones; el listado también incluye las que no tienen texto. |
| **Sesiones agendadas** | Reservas Programada futuras y en curso, incluyendo ambos bloques si un paciente tiene dos consecutivos. | Todas las reservas futuras y en curso. |

No hay contadores de ejemplo. Cero representa que no hay registros que cumplan la condición; los estados vacíos explican cómo continuar.

### Pacientes: crear, consultar y editar

**Pacientes → Crear paciente** abre el formulario de identificación, modalidad, motivo y Nota. Todo paciente nuevo comienza `Activo`: no se solicita estado ni frecuencia. No se pide una fecha de inicio; puede guardarse sin sesión y aparecerá en Pendientes de agendar.

No existe recurrencia automática. La frecuencia antigua se conserva en la base por compatibilidad histórica, pero ya no se solicita ni se muestra como una decisión de agendamiento.

Se propone un código disponible, por ejemplo `P-001`. La sugerencia no reserva ese código. Puede personalizarse o dejarse vacío para generar uno al guardar. Si otro registro ya lo ocupa, el formulario conserva lo escrito y muestra el conflicto.

**Crear paciente** guarda el alta y abre su ficha. **Cancelar** vuelve al listado sin crear registros. Las tarjetas muestran la fecha completa y la hora de la próxima sesión (por ejemplo, `23/10/2026 · 15:30 hs`), o **Sin sesión agendada** si no hay una reserva vigente, además de la fecha de creación. Esa información se calcula desde las sesiones reales, sin reutilizar el día y horario habitual de la ficha.

Desde una ficha, **Editar ficha** permite modificar código, modalidad, estado (`Activo`, `Suspendido`, `De vacaciones`), motivo y Nota. Un estado personalizado anterior puede conservarse. El día y la hora habitual se muestran grisados como información; ya no hay un botón para reasignar horarios desde la ficha. El agendamiento se realiza desde Agenda o Pendientes, y una sesión existente se reprograma desde su detalle. La próxima sesión se calcula desde las reservas. **La fecha de creación no se puede editar**, tampoco por la API.

**Inicio del tratamiento** muestra automáticamente la fecha más antigua de las sesiones marcadas manualmente como **Realizada** para ese paciente. Una reserva futura no inicia el tratamiento. Si todavía no tiene sesiones realizadas, aparece **Sin sesiones realizadas**. La fecha es de lectura: se guarda y recalcula en la misma transacción al confirmar o corregir una sesión, incluyendo cambios de fecha, paciente o estado. No se configura en el alta ni en la edición de la ficha.

**Dar de baja** requiere una confirmación explícita: cambia el estado a `De baja`, cancela las sesiones programadas que todavía no comenzaron y libera sus intervalos. Conserva la ficha, el histórico, los resúmenes y los importes. Cambiar a Suspendido o De vacaciones impide nuevas reservas y retira al paciente de pendientes; no cancela por sí solo lo ya reservado.

**Pacientes no activos** reúne Suspendido, De vacaciones, De baja y otros estados anteriores distintos de Activo. Se accede desde Pacientes o Pendientes de agendar; cada ficha sigue permitiendo consultar sus datos y cambiar el estado. La ruta `/pacientes/estado/no-activos` evita reservar un código de paciente que ya pudiera existir.

Los formularios trabajan sobre un borrador. Guardar envía los datos a la API; Cancelar descarta cambios no enviados. Los errores de validación, duplicados o conexión conservan el borrador. Mientras una solicitud está en curso se bloquean los botones de guardado para evitar duplicarla.

### Agenda y agendamiento

Agenda abre la **semana actual, de lunes a domingo**, con botones Anterior, Esta semana y Siguiente. Cada día intercala sus franjas libres y sesiones en orden horario: antes de la primera reserva, entre reservas y después de la última, dentro de 08:00–22:00. Solo se ofrecen franjas en las que entra una sesión de al menos 30 minutos con inicio cada 15 minutos. Se pueden consultar semanas anteriores, incluso de otro mes; los días pasados y los domingos no admiten reservas. Hoy solo permite horas que todavía no transcurrieron, según Buenos Aires. El límite de nuevas reservas continúa siendo el último día del mes siguiente.

El bloque verde de la **próxima sesión programada** de cada paciente incluye **Nota**. Abre un modal de lectura con la Nota vigente de su ficha, sin copiarla al resumen histórico ni a reservas posteriores. Cuando hay dos bloques consecutivos solo el primero pendiente muestra Nota. Desde el modal se puede abrir la ficha para editarla. La Nota no se incorpora a las respuestas del calendario; se consulta al abrirla usando los permisos de la cuenta.

No se cargan horarios ni rangos laborables previamente. Las franjas se calculan restando las sesiones no canceladas del intervalo **08:00–22:00, de lunes a sábado**. Se ofrece Agendar cuando queda un intervalo consecutivo de al menos 30 minutos. Las reservas empiezan cada 15 minutos y duran **30, 40, 50 o 60 minutos**; deben terminar como máximo a las 22:00. Son reglas de esta aplicación, no una afirmación sobre un estándar profesional.

La duración avanza de a diez minutos, con mínimo 30 y máximo 60, tanto al reservar como al editar una sesión. El backend y el CHECK de PostgreSQL verifican las mismas cuatro opciones. La migración `005_duracion_diez_minutos.sql` actualiza únicamente esa restricción, sin modificar sesiones existentes. Se conserva la validación del intervalo completo ante aumentos de duración.

**Agendar sesión** abre el calendario para elegir día, inicio y duración. El límite de reserva es el último día del mes siguiente. El alta del paciente también permite seleccionar la primera reserva y conserva su borrador al volver; la ficha ya no ofrece reasignar horarios.

Al reservar se elige un paciente activo, modalidad y honorarios en ARS. Se propone la duración de su última sesión, que puede modificarse. Aumentarla comprueba el intervalo completo y muestra un error si se superpone; no desplaza automáticamente la hora elegida. Express vuelve a validar todo dentro de una transacción.

Cada paciente puede tener **una única fecha futura**, con la excepción de **hasta dos sesiones consecutivas ese mismo día**. Los dos bloques conservan sus propios estados, honorarios y cobros. No se permite una tercera sesión, un bloque separado ni otra fecha mientras exista una próxima sesión.

La pantalla de agendamiento trabaja únicamente con pacientes ya creados; no ofrece crear uno desde allí. El buscador muestra coincidencias de código mientras se escribe, sin distinguir mayúsculas. Se confirma una opción de la lista (también con teclado); escribir texto libre no conserva una selección anterior oculta. Si se llega desde Pendientes de agendar, el paciente seleccionado queda bloqueado.

El alta se inicia desde **Pacientes → Crear paciente**. Su botón para elegir horario permite volver con la fecha, inicio y duración seleccionados y guardar **Crear paciente y agendar**. El backend sigue realizando el alta y la reserva conjuntamente en una transacción, sin dejar registros parciales ante conflictos.

En ese recorrido el **día y horario habitual** se completan con la fecha y hora
seleccionadas y quedan grisados. Se incluyen igualmente al guardar la ficha.
El backend también deriva ambos del turno para evitar combinaciones incoherentes.
Al crear directamente desde Pacientes pueden quedar sin definir; el botón
**Asignar horario disponible** permite elegirlos y agendar la primera sesión.
Ir al selector y volver conserva lo escrito; seleccionar todavía no reserva.

Al agendar se actualizan la etiqueta de próxima sesión y el día/hora habitual. Para mover una sesión existente se abre **Detalle de sesión → Editar sesión → Elegir horario** y se confirma el cambio allí, conservando su ID y sus importes. Editar la ficha no mueve ni crea sesiones. La modalidad habitual del tratamiento y la modalidad de una sesión son datos distintos.

En **Próximas sesiones**, cada paciente activo sin reserva futura ni sesión en curso muestra su última sesión. Se puede proponer el mismo día y hora para la semana próxima o elegir otra fecha. **Dejar sin próxima fecha / marcar como no pendiente** explica que cambiará a Suspendido y solicita confirmarlo: solo después de guardar sale de la cola y del contador, y aparece en Pacientes no activos. Un error conserva el pendiente. Al terminar una sesión, un paciente activo vuelve a pendientes aunque todavía no se haya confirmado asistencia.

**Desagendar sesión**, desde el detalle de una sesión futura programada, la deja `Cancelada` y libera su intervalo. Conserva sus datos e importes y no crea una repetición para la semana siguiente. La edición histórica sigue permitiendo corregir fechas ya registradas sin generar nuevas reservas pasadas.

### Últimas sesiones por paciente

Toda sesión agendada comienza como **Programada**. Desde su detalle se puede seleccionar **Marcar como realizada** cuando llegó su horario. Esta acción confirma que efectivamente ocurrió.

Que pase la hora no cambia automáticamente su estado: una sesión que no se confirmó continúa programada y no aparece en el histórico de realizadas ni en pendientes de cobro. El histórico usa la fecha de la sesión, no la fecha en que se presionó el botón.

**Inicio → Últimas sesiones** abre `/sesiones` y muestra una sola sesión por paciente: la marcada como **Realizada** con fecha y horario más recientes. El listado completo se ordena de la más reciente a la más antigua, sin navegación semanal ni recorte de dos meses. Incluye pacientes no activos que tengan sesiones realizadas; quienes todavía no tienen ninguna no generan una tarjeta. Las reservas Programada y Cancelada quedan fuera.

Cada tarjeta conserva fecha, horario, paciente, modalidad y **pendiente de cobro sobre el total de honorarios**, incluido cero si está saldada. Seleccionarla abre el detalle existente. Volver actualiza el listado y los cobros; el contador de Inicio corresponde a la cantidad de tarjetas, una por paciente. `GET /sesiones/ultimas` selecciona estos registros dentro de la cuenta del JWT, sin crear tablas ni duplicar sesiones. El histórico individual sigue permitiendo consultar todas las realizadas de un paciente.

El listado se presenta en **páginas de cinco sesiones**, manteniendo las más recientes primero. **Anterior** y **Siguiente** permiten recorrerlo e indican la página actual y el total; aparecen cuando hay más de una página. Al volver del detalle se conserva la página, ajustándola si una corrección redujo el listado. El contador de Inicio y la cantidad del encabezado siempre representan el total completo.

### Histórico de sesiones de un paciente

**Ficha del paciente → Ver histórico de sesiones** abre todas sus sesiones marcadas como **Realizada**, de la más reciente a la más antigua, sin límite de semana o mes. Cada tarjeta muestra fecha, inicio y final, duración, modalidad, honorarios, total cobrado, saldo pendiente y resumen cuando existe. Seleccionar la tarjeta abre el detalle existente; el paciente permanece bloqueado al editar una sesión cuyo horario ya pasó.

También se pagina de a **cinco sesiones**, con las mismas opciones Anterior/Siguiente. Se conserva la página al regresar del detalle y se comienza en la primera al consultar otro paciente. Esta paginación se realiza en Angular sobre los registros ya ordenados de la API, sin modificar endpoints ni datos almacenados.

Se consulta `GET /pacientes/:codigo/sesiones` con la identidad del JWT. Solo devuelve datos del paciente dentro de esa cuenta; también se puede consultar una ficha suspendida o dada de baja. Las sesiones Programada, aunque haya pasado su fecha, y las Cancelada no se incluyen. No se agregan tablas, copias de sesiones ni Notas de próximas reservas al histórico. Volver desde el detalle actualiza la lista para reflejar correcciones de resúmenes, cobros o asistencia. Inicio ofrece el listado resumido de Últimas sesiones.

### Notas de próximas sesiones

**Inicio → Notas** muestra la próxima sesión programada de cada paciente, incluidas las que están en curso, por fecha y horario. Cada tarjeta indica código del paciente (enlace a su ficha), fecha y hora y una previsualización de hasta tres líneas. Seleccionar un texto existente abre el modal amarillo claro, sin el rótulo Ver Nota completa. Las tarjetas **Sin nota registrada** son compactas, aproximadamente de la mitad de alto, y ofrecen **Agregar Nota**: abre la sesión directamente en edición con el campo Nota al principio. Guardar vuelve a Notas y refresca el listado. No se duplica la Nota en el segundo bloque consecutivo ni se incluye en el histórico.

El editor de sesión permite modificar la Nota de su próxima reserva Programada, de hasta 300 caracteres y distinta del resumen de 100. Omisión conserva el texto; vacío lo retira. Se guarda junto con los cambios de sesión en una transacción y conserva el borrador si falla. Una sesión que dejó de ser la próxima, un bloque posterior o una sesión histórica no puede cambiar la Nota. El acceso desde un enlace desactualizado informa la situación y pide actualizar el listado.

**Agenda → Agendar sesión** incluye **Nota para la próxima sesión (opcional)**, de hasta 300 caracteres, con contador y recomendación de evitar datos sensibles. Se carga la Nota vigente al seleccionar el paciente. Si se edita, reserva y Nota se guardan en la misma transacción; un conflicto no modifica ninguna. Omitir el campo conserva la Nota y enviarlo vacío permite retirarla. Los modos de selección de horario no agregan otro editor: el alta y la ficha conservan el suyo.

El nombre visible **Nota** reemplaza a Post-it en las pantallas. Por compatibilidad, el campo interno sigue llamándose `postIt`; no hay migraciones, tablas nuevas ni cambios sobre las notas existentes.

### Sesiones agendadas

**Inicio → Sesiones agendadas** muestra las reservas Programada futuras o en curso de la cuenta, ordenadas por fecha y horario; el acceso general se retiró de Agenda. La misma pantalla se abre desde **Ficha del paciente → Sesiones agendadas**, filtrada por ese paciente; el filtro viaja en la URL y se conserva al recargar o volver de un detalle. El botón Volver del listado general regresa a Inicio; el del listado filtrado, a la ficha.

Cada reserva muestra paciente, fecha, inicio y final, duración, modalidad, honorarios, cobrado, saldo y resumen si tiene. La **Nota vigente** se presenta directamente en la próxima sesión del paciente; no se repite en su segundo bloque consecutivo ni se copia al histórico. Se edita desde la ficha o al agendar. Si está vacía, se indica. Las sesiones realizadas, canceladas o cuyo intervalo ya terminó quedan fuera de este listado. Desde cada reserva se abre el detalle existente. Volver al listado actualiza datos y notas.

### Edición completa de una sesión

El detalle se presenta en modo lectura con inicio, final y duración. **Editar sesión** abre un borrador con paciente, fecha, horario, duración, modalidad, estado, honorarios y total cobrado. Para mover una sesión futura se usa el calendario; fecha y hora no se escriben libremente. **Guardar cambios** confirma todo junto y **Cancelar** descarta el borrador. Se conserva el ID y el saldo se calcula desde los importes.

Cuando el horario original de una sesión ya pasó, el selector de paciente queda bloqueado con el paciente asignado. Se aplica tanto a sesiones Realizada como a Programada pendientes de confirmar. El backend también rechaza la reasignación con 409, aunque el pedido intente cambiar simultáneamente la fecha; los demás datos mantienen su edición habitual.

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
| `estado` | Alta siempre Activo; edición Activo, Suspendido o De vacaciones. La baja usa su acción explícita. Se conserva un estado histórico sin cambiar. |
| `frecuencia` | Campo histórico de hasta 40 caracteres; no se solicita en las pantallas ni genera recurrencias. |
| `proximaSesion` | Etiqueta derivada de la próxima sesión no cancelada, futura o en curso; `null` cuando no existe. No se edita en la pantalla. |
| `diaHabitual` | `null` o uno de los siete nombres de días en español. |
| `horarioHabitual` | `null` o una hora válida de 24 horas, con formato `HH:mm`. |
| `fechaCreacion` | Fecha `YYYY-MM-DD`, asignada por el servidor y conservada durante las ediciones. |
| `fechaInicioTratamiento` | `null` hasta la primera sesión Realizada; luego, la menor fecha de esas sesiones en `YYYY-MM-DD`. Se calcula y guarda en el servidor; no se edita. |
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
│       ├── agenda/               Calendario del mes actual y siguiente
│       ├── agendar/              Reserva y selección de intervalos libres
│       ├── proximas-sesiones/    Pacientes pendientes de confirmar su próxima fecha
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
│   │   ├── agenda-calendario.ts  Duraciones, intervalos y reglas de reserva
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

Los componentes son `standalone`: cada pantalla declara las dependencias que usa. `app.routes.ts` registra `/inicio`, `/pacientes`, `/pacientes/nuevo`, `/pacientes/:codigo`, `/agenda`, `/agenda/agendar`, `/agenda/horarios-disponibles`, `/proximas-sesiones`, `/sesiones` y `/sesiones/:id`. El selector reutiliza Agendar con variantes `/crear`, `/paciente` y `/sesion` para conservar el borrador correspondiente en la pila de Ionic. La ruta estática `pacientes/nuevo` se declara antes de `pacientes/:codigo`.

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
| `emailConfirmado` | Las altas nuevas quedan en `false` y no pueden ingresar hasta confirmar. La migración 008 habilita las cuentas anteriores por excepción, sin afirmar que se verificaron por email. |
| `versionCredenciales` | Se incrementa al restablecer la contraseña e invalida los JWT de versiones anteriores. |
| `confirmacionHash`, `confirmacionVence` | SHA-256 del enlace de confirmación y su vencimiento; ambos nulos cuando no hay uno pendiente. |
| `recuperacionHash`, `recuperacionVence` | SHA-256 del enlace de recuperación y su vencimiento; se consumen al cambiar la contraseña. |

Hashear una contraseña significa obtener una representación para verificarla sin guardar el texto original. Se utiliza **Argon2id**, mediante la biblioteca `argon2`, con una sal aleatoria generada por la biblioteca y sus parámetros de costo predeterminados. El hash incluye algoritmo, parámetros y sal necesarios para verificarlo: la sal no es una contraseña ni necesita ser secreta.

Un hash no es un cifrado reversible: no hay una clave que permita recuperar la contraseña original. En el login, `argon2.verify` comprueba la candidata contra el hash almacenado. Quien obtuviera los hashes podría intentar adivinar contraseñas; el costo de Argon2 dificulta cada intento y las contraseñas largas siguen siendo necesarias. El JWT usa un secreto diferente: ese secreto firma tokens, no descifra contraseñas.

Antes de elegir la dependencia se comprobó el entorno **Node 24.14.1 / Windows x64**, el rango `engines` publicado y el soporte de la biblioteca; también se ejecuta una prueba real de hash y verificación en ese entorno. `argon2` publica binarios para Windows x64 y documenta el uso de Argon2id. La firma y verificación JWT se delegan en `jose`, compatible con los módulos ESM del backend. Las versiones exactas quedan fijadas en `backend/package-lock.json`. Referencias: [node-argon2](https://github.com/ranisalt/node-argon2), [jose](https://github.com/panva/jose).

El registro acepta únicamente `email`, `password` y `repetirPassword`. Devuelve los datos públicos y `correoEnviado`, sin iniciar sesión automáticamente. La cuenta queda pendiente hasta confirmar su email. Si falla el envío después de crearla, se informa esa situación y se puede solicitar un nuevo correo. Si no hay proveedor configurado, se rechaza el alta antes de crear registros. El login acepta `email` y `password`; un email inexistente y una contraseña incorrecta reciben el mismo mensaje. Una contraseña correcta con email pendiente recibe 403, sin JWT. Ni las contraseñas, ni los hashes, ni los tokens se escriben en los logs de la aplicación.

### Confirmación y recuperación por correo

Login incluye **¿Olvidaste tu contraseña?** y **Reenviar email de confirmación**. El registro muestra el paso pendiente, sin permitir entrar todavía al consultorio. El enlace de confirmación vence en **24 horas**; el de recuperación, en **30 minutos**. Abrir la pantalla no consume el enlace: se confirma con un botón explícito. Los enlaces son aleatorios, de 32 bytes, de un solo uso; PostgreSQL conserva únicamente SHA-256. Un nuevo envío invalida el enlace anterior de ese tipo. Hay un minuto mínimo entre envíos por cuenta y límites HTTP por IP.

Las solicitudes de recuperación y reenvío responden con el mismo estado y JSON para direcciones inexistentes o que no necesitan ese enlace. La recuperación se envía a cuentas ya confirmadas; si falta confirmar el email, primero se usa el reenvío. Los enlaces apuntan al origen Angular configurado, sin confiar en `Host` ni en una URL del cliente. El token viaja en el fragmento `#token=…`, no en consultas que puedan quedar en logs HTTP, y se usa `no-referrer`.

La solicitud confirma primero el token en SQL y responde sin esperar al proveedor externo, para que la demora del correo no revele cuentas. Express espera los envíos en curso al cerrarse ordenadamente. No hay cola persistente: una caída abrupta puede interrumpir el envío; en ese caso se solicita otro enlace. El alta sí espera el resultado para poder informar `correoEnviado`.

Guardar la contraseña nueva aplica las mismas reglas de 12–128 caracteres y Argon2id. Una única sentencia PostgreSQL guarda el hash nuevo, consume el enlace e incrementa `versionCredenciales`. No se inicia sesión automáticamente. Los JWT anteriores dejan de autorizar solicitudes; los datos clínicos y las demás cuentas se conservan. El logout habitual sigue siendo local.

El adaptador de correo está separado de los flujos y usa `fetch` de Node contra la API HTTPS de Resend, sin instalar dependencias. Solo se activa con configuración privada explícita. En las pruebas se inyecta un buzón en memoria y no se envían mensajes reales. Las migraciones 007 y 008 ya se aplicaron en desarrollo después de generar un respaldo privado: la cuenta existente conserva el acceso y las altas nuevas quedan pendientes de confirmación. La migración 008 toma el momento de aplicación de la 007 para distinguir cuentas anteriores, sin habilitar las creadas después. El cambio exige volver a iniciar sesión: los JWT anteriores no contienen la versión de credenciales.

Para probar Resend sin dominio propio se usa su remitente de prueba, limitado al email de la propia cuenta de Resend. Enviar a otros usuarios requiere verificar un dominio. La cuenta y la credencial de envío se configuraron de forma privada; no hay secretos en el repositorio. Referencias: [restricción del dominio de prueba](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [API de envío](https://resend.com/docs/api-reference/emails/send-email), [OWASP: recuperación de contraseña](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

En esta computadora se preparó un configurador privado, fuera del proyecto. Después de crear y confirmar la cuenta de Resend, se genera una API key con permiso **Sending access** y se ejecuta:

```powershell
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Configurar-Correo.ps1"
```

El configurador privado tiene preseleccionado el email elegido por el usuario y solicita la clave con entrada oculta. Guarda la API key protegida por DPAPI en `correo.dpapi.json`, fuera del repositorio, y configura el remitente `PSIQUE <onboarding@resend.dev>` con ese único destinatario permitido. El lanzador privado de `dev`/`iniciar` carga la configuración solo en memoria para el proceso y restaura el entorno al cerrar; pruebas y migraciones no descifran esa credencial. Después de guardarla hay que reiniciar el backend. No se deben pegar claves en el chat, en comandos literales ni en archivos versionados.

El **23/10/2026** se reinició el backend habitual con esa configuración y se envió un mensaje general de prueba, sin datos clínicos ni enlaces para cambiar contraseñas. Resend lo aceptó con **HTTP 200** y el usuario confirmó su recepción en la casilla. También respondió 200 una solicitud de recuperación para una dirección inexistente, comprobando que el proceso habitual tiene el correo habilitado, sin enviar otro mensaje ni crear registros. Frontend y readiness PostgreSQL respondieron 200. Quedaron verificadas tanto la aceptación por el proveedor como la recepción del mensaje general de prueba. Los flujos completos de cuenta conservan las pruebas aisladas documentadas; esta comprobación no restableció la contraseña real del usuario.

### JWT y middleware de Express

Un **JWT** es un conjunto de datos JSON firmado. Express lo genera después de verificar las credenciales y la confirmación del email. Incluye `sub` (ID del profesional), `iat` (emisión), `exp` (vencimiento), `iss` (emisor), `aud` (destinatario) y `versionCredenciales`. No incluye historias clínicas, pacientes ni contraseñas. Está firmado con **HS256** y vence a los **3600 segundos**. La firma detecta modificaciones; no cifra su contenido, que se puede leer.

El cliente recibe `{ token, usuario, expiraEn }`. En cada solicitud privada envía `Authorization: Bearer <token>`. El middleware restringe el algoritmo a HS256 y verifica firma, emisor, destinatario, vencimiento y sujeto, además de comprobar que el usuario sigue existiendo, tiene email confirmado y conserva la versión de credenciales del JWT. Solo entonces deja su ID en `res.locals.usuarioId` y permite continuar al endpoint. Un token ausente, inválido, revocado o vencido produce **401**.

Registro, login, confirmación, recuperación, reenvío y restablecimiento se montan antes del middleware; el resto de `/api` queda detrás de él. El secreto proviene de `JWT_SECRET` y se valida al iniciar. El navegador jamás recibe ese secreto. Se conserva CORS para el origen local configurado; CORS no autentica ni aísla profesionales.

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
| `POST /auth/registro` | `{ email, password, repetirPassword }` → `{ usuario: { id, email, fechaCreacion }, correoEnviado }`; cuenta pendiente de confirmación. |
| `POST /auth/login` | `{ email, password }` → `{ token, usuario: { id, email, fechaCreacion }, expiraEn: 3600 }`. |
| `POST /auth/reenviar-confirmacion` | `{ email }` → mensaje genérico de solicitud; no necesita JWT. |
| `POST /auth/confirmar-email` | `{ token }` → confirma el email y consume el enlace; no inicia sesión. |
| `POST /auth/recuperar` | `{ email }` → mensaje genérico de solicitud de recuperación. |
| `POST /auth/restablecer` | `{ token, password, repetirPassword }` → guarda la contraseña, consume el enlace e invalida JWT anteriores. |

Los siguientes endpoints son **privados** y requieren el Bearer; todos operan dentro de la cuenta autenticada:

| Método y ruta | Datos o comportamiento |
| --- | --- |
| `GET /pacientes` | Arreglo de pacientes, ordenado por código. |
| `GET /pacientes/siguiente-codigo` | `{ codigo }` sugerido; no lo reserva. |
| `GET /pacientes/pendientes-agendar` | Pacientes activos sin próxima sesión, junto con su última sesión no cancelada. |
| `GET /pacientes/:codigo` | Ficha de un paciente. |
| `GET /pacientes/:codigo/proximas` | Sesiones futuras o en curso del paciente, no canceladas. |
| `POST /pacientes/:codigo/baja` | Baja lógica y cancelación de reservas que todavía no comenzaron, sin borrar historial ni dinero. |
| `POST /pacientes` | Recibe `{ paciente, turno? }`; devuelve `{ paciente, sesion }`. La sesión es `null` en un alta independiente. |
| `PUT /pacientes/:codigo` | Actualiza la ficha identificada por el código anterior. Puede incluir `turno: { fecha, horario, duracionMinutos }` para reprogramar la próxima sesión en la misma transacción. Sin turno se conservan día/hora habitual. La fecha de creación no puede cambiar. |
| `GET /sesiones/ultimas` | Última Realizada de cada paciente de la cuenta, ordenadas por fecha y horario descendentes. Alimenta Últimas sesiones y su contador de Inicio. |
| `GET /sesiones/semana?fecha=YYYY-MM-DD` | Consulta semanal anterior conservada por compatibilidad, sin acceso desde Inicio: `{ desde, hasta, sesiones }`. |
| `GET /sesiones/pendientes` | Arreglo de sesiones realizadas con saldo, de cualquier fecha. |
| `GET /sesiones/:id` | Datos e importes de una sesión. |
| `POST /sesiones` | Recibe `{ fecha, horario, duracionMinutos, codigoPaciente, modalidad, importeCentavos }` y reserva un intervalo libre del calendario. Devuelve la sesión con duración y horarioFin. |
| `POST /sesiones/:id/realizar` | Confirma que ocurrió una sesión cuyo horario ya llegó. Devuelve la sesión realizada. |
| `POST /sesiones/:id/cancelar` | Desagenda una sesión futura Programada y conserva el registro Cancelada. |
| `PUT /sesiones/:id` | Edición conjunta con duración, importes y resumen opcional. Comprueba el intervalo completo antes de confirmar; conserva ID y saldo calculado. Omitir resumen conserva el anterior. |
| `GET /calendario?fecha=YYYY-MM-DD&excluirSesion=id` | Con fecha devuelve los siete días de esa semana, incluso si cruza de mes. Sin fecha conserva la ventana de validación del mes actual y siguiente. Las sesiones incluyen esProxima, sin Post-it. La exclusión opcional exige una sesión propia. |
| `GET /horarios/disponibles`, `GET /horarios/disponibles/todos`, `POST /horarios` | Rutas antiguas retiradas del flujo PostgreSQL: responden 410 y remiten al calendario. |
| `GET /horarios/:fecha/:horario` | Horario individual, estado, paciente, modalidad y `sesionId`, si tiene sesión. |
| `GET /agenda?fecha=YYYY-MM-DD` | Consulta semanal de sesiones conservada para compatibilidad; la pantalla nueva usa calendario. |
| `GET /dashboard` | `{ pacientesActivos, sesionesSemana, pendientesCobro, pendientesAgendar }` calculado. |

En el alta, el código es opcional y la fecha de creación no se debe enviar. No se necesita enviar estado, frecuencia ni próxima sesión. Por ejemplo:

```json
{
  "paciente": {
    "codigo": "PA-01",
    "modalidad": "Virtual",
    "motivoConsulta": "",
    "postIt": ""
  }
}
```

El ejemplo es un alta independiente. Para reservar al mismo tiempo se agrega un objeto `turno` al mismo nivel: `{ "fecha": "YYYY-MM-DD", "horario": "15:00", "duracionMinutos": 60, "modalidad": "Virtual", "importeCentavos": 2500000 }`, reemplazando la fecha por una válida del calendario.

CORS permite GET, POST y PUT para el origen configurado; no sustituye la autenticación. La baja y la cancelación son lógicas: no existe eliminación física por la API.

## Alcance pendiente

La aplicación utiliza PostgreSQL, autenticación y datos separados por profesional. Confirmación de email para cuentas nuevas y recuperación de contraseña están implementadas, verificadas en pruebas y con su esquema activo en desarrollo. Resend está configurado privadamente; el primer mensaje real de prueba fue aceptado por el proveedor y su recepción fue confirmada por el usuario. Las cuentas anteriores conservan el acceso por la excepción de la migración 008. Quedan para otras etapas el despliegue con HTTPS y la operación periódica de backups. No se incorporaron Google Sign-In, MFA, roles de profesionales, refresh tokens, biometría ni bloqueo por inactividad. No incluye recurrencia automática ni movimientos individuales de pago. La distribución móvil instalable continúa pendiente; SQLite se conserva como referencia histórica.

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
- `scripts.test:config`: prueba configuración, interceptor y recorridos de formularios Angular reales con Node.
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

### Inicio automático del tratamiento — 22/10/2026

La migración 006 permite inicio nulo y recalcula ese único campo desde las sesiones realizadas existentes, filtradas por profesional y paciente. Se respaldó desarrollo antes de aplicarla. Pasaron **86 resultados PostgreSQL**, **82 del backend** y **15 de formularios/configuración Angular**, junto con ambas compilaciones. Se verificaron alta sin inicio, reserva que no confirma asistencia, primera realizada, correcciones de fecha/paciente/estado, renombrado, persistencia, aislamiento y rollback ante fallos. Las versiones SQLite históricas conservan sus reglas anteriores.

En Chrome se comprobó una ficha con inicio derivado y otra sin sesiones realizadas: la edición no tiene input de fecha ni botón de reasignar horarios, y el alta tampoco tiene fechas configurables. La integración utilizó únicamente cuentas ficticias de `psique_test`, retiradas al finalizar. En desarrollo se verificó que no hay diferencias entre el inicio guardado y la primera realizada; las huellas de todos los demás datos se conservaron.

### Duraciones 30, 40, 50 y 60 — 22/10/2026

Se aprobaron **85 resultados PostgreSQL**, **82 del backend** y **15 de formularios/configuración Angular**, además de ambas compilaciones. Se probaron reservas de 40 y 50 minutos, sus horarios de finalización, edición y persistencia tras reinicio, rechazo de 45 minutos en API y base, y rollback ante una superposición al ampliar duración. La migración 005 se aplicó en pruebas y desarrollo tras respaldar la base habitual. Las huellas completas de usuarios, pacientes, turnos y sesiones coincidieron antes y después: las cuatro sesiones existentes conservaron sus 60 minutos y demás datos.

### Agenda semanal, notas y mosaico — 22/10/2026

Se aprobaron **83 resultados PostgreSQL**, **82 del backend y reglas de calendario** y **15 de configuración/formularios Angular**. Compilaciones correctas. Se verificaron semanas que cruzan de mes, plazo de reserva, identidad de la próxima sesión, aislamiento, buscador, bloqueo del paciente, separación de listados y suspensión con conservación de pendientes ante errores. No se requirieron migraciones ni cambios en registros de desarrollo.

En Chrome se comprobó Inicio a **360 × 640**: cuatro mosaicos en dos columnas y contenido sin scroll vertical (alto visible y alto total de contenido: 571 px). También se verificaron avance y regreso a la semana actual, modal del Post-it, paciente bloqueado desde pendientes, reserva con identidad conservada, coincidencias y selección con teclado, aviso de suspensión, persistencia tras recarga y aparición exclusiva del suspendido en la pantalla de no activos. Los datos de integración pertenecen exclusivamente a `psique_test`.

### Calendario y próximas sesiones — 21/10/2026

Pasaron **82 resultados PostgreSQL**, **81 resultados del backend histórico y reglas de calendario**, y **10 resultados de configuración/formularios Angular**. Las compilaciones de backend y frontend finalizaron correctamente. Las pruebas PostgreSQL usan exclusivamente `psique_test`, con registros identificados y limpieza propia.

Se verificaron intervalos completos, duración 30/45/60, ventana de dos meses, domingos, límites diarios, dos bloques consecutivos, conflictos simultáneos, rollback incluido COMMIT fallido, aislamiento, baja, cancelación, reutilización del intervalo, persistencia tras reinicio y etiquetas que vencen sin escribir durante las lecturas.

En Chrome, con cuentas ficticias de `psique_test`, se probaron registro/login, alta sin estado ni frecuencia, borrador al seleccionar horario, conflicto al ampliar duración, baja, segundo bloque consecutivo, desagendamiento, cola sin próxima fecha y calendario de escritorio. Se creó una reserva desde Angular, se reinició Express y se volvió a consultar su duración e importes. La última comprobación visual a 360 px quedó pendiente por una interrupción de la conexión del navegador; la adaptación CSS está compilada.

Las migraciones **003 y 004** agregan duración y cancelación. Todas las sesiones anteriores recibieron **60 minutos**, sin desplazar fechas ni cambiar importes o estados. Se respaldó desarrollo antes de aplicarlas. La comparación de cantidades y huellas de usuarios, pacientes, turnos y sesiones (excluyendo solo la columna nueva) coincidió antes y después. Las migraciones 001 y 002 y los SQLite archivados se conservaron.

La comprobación de desarrollo encontró 4 sesiones, todas con 60 minutos y ninguna sin duración ni superposición. Un horario anterior no cumple las reglas nuevas de inicio y se conservó: el calendario no corrige registros antiguos por su cuenta.

Los contratos de la disponibilidad manual y de múltiples fechas futuras quedaron en `backend/test-postgres/historico/`, y los formularios antiguos en `test-config/historico/`, como referencia de reglas reemplazadas. Los comandos actuales ejecutan los casos del calendario; las cantidades de verificaciones anteriores no se suman ni equivalen a la suite vigente.

Para probar: Inicio → Pendientes de agendar o Agenda → Agendar sesión → elegir día, paciente, inicio y duración → Guardar. Desde el detalle se puede editar o desagendar; desde la ficha, dar de baja. La siguiente sesión siempre requiere confirmación manual.

### Antecedente: asignación manual de horarios — 21/10/2026

Este apartado registra la verificación anterior al calendario; sus pantallas y reglas fueron reemplazadas.

Compilaciones de frontend y backend correctas. Pasaron **146 resultados** en la
suite PostgreSQL (incluye el recorrido nuevo también con SQLite), **75 resultados**
de la suite histórica y **11 resultados** de configuración/formularios Angular.
Las bases de desarrollo y los respaldos no se usan para estas pruebas.

Se verificaron intervalos de quince minutos, listado de otras semanas, aislamiento,
alta con día/hora derivados del turno, asignación sin próxima sesión, reprogramación
con renombrado, conservación del histórico e importes, conflictos simultáneos y
rollback ante un error SQL después de ocupar el destino.
En Chrome se comprobó la nueva opción de Agenda, listado y acceso al agendamiento,
día/hora bloqueados, minutos inválidos, selección desde alta y edición, conservación
del borrador y cancelación. Estas comprobaciones visuales no guardaron registros
de prueba en desarrollo. No se modificó el esquema ni se requirieron dependencias.

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
