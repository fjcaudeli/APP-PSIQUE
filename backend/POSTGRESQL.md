# PostgreSQL — esquema y migraciones de PSIQUE

**PostgreSQL es la única base habitual del backend desde la etapa 3C.**

Esta documentación conserva las etapas 2, 3A y 3B como antecedentes y describe
la activación de la etapa 3C al final. La preparación vigente de la etapa 4B se
describe a continuación. Las descripciones históricas corresponden
al estado de cada etapa, no al arranque actual. El servidor usa PostgreSQL para
autenticación y negocio; SQLite, su código y sus respaldos se conservan.

No hay fallback, doble escritura ni migración automática de datos o esquema.

## Resumen opcional de sesión — 21/10/2026

`migrations/002_resumen_sesion.sql` agrega `sesiones.resumen`, un `TEXT NOT NULL`
con valor predeterminado vacío y un `CHECK` de hasta 100 caracteres. No se modifica
la migración 001. Los registros existentes conservan sus datos y reciben una cadena
vacía. Se aplica con los comandos habituales `db:migrate` y `db:migrate:test`.

Las respuestas de sesión incluyen `resumen`. El PUT de edición admite ese campo
opcional: omitirlo conserva el anterior, una cadena vacía lo borra y un tipo distinto
de texto o más de 100 caracteres recibe 400. Angular muestra contador y recomendación
de evitar datos sensibles. Se conserva el filtrado por profesional y la transacción
de edición completa. No se registra el contenido en logs.

El adaptador SQLite histórico conserva el mismo contrato mediante su versión 3,
que agrega la columna al abrir explícitamente una base de versión 2. Las pruebas
usan archivos temporales; el backend habitual no abre ni migra los SQLite archivados.

Verificación del 21/10/2026: 126 resultados PostgreSQL y 75 SQLite aprobados;
compilaciones de backend y Angular correctas. Se comprobaron límite 100/101,
tipos inválidos, guardado, borrado, omisión que conserva el valor y aislamiento.
En Chrome se verificaron el campo opcional, la ayuda, el contador y el rechazo
del carácter 101; cancelar descartó el borrador. La sesión de demostración conserva
fecha, estado e importes. La migración 002 se aplicó en desarrollo y pruebas mediante
el migrador, después de respaldar desarrollo fuera del proyecto. La 001 y los
archivos SQLite y respaldos anteriores permanecen sin modificaciones.

## Etapa 4B: configuración local y preparación de Render

Verificación del **19/10/2026**. Sin infraestructura ni despliegue remotos.
Se conservan bases, roles y credenciales locales. Las escrituras de pruebas se
limitaron a `psique_test`; desarrollo conserva cero registros en las cuatro tablas.
El primer ensayo remoto será exclusivamente con datos ficticios.

### Configuración y ciclo de vida

`src/configuracion.ts` valida NODE_ENV, PORT, HOST, FRONTEND_ORIGIN y
TRUSTED_PROXY_CIDRS. Sin NODE_ENV utiliza development. Localmente escucha en
127.0.0.1:3000 y rechaza HOST=0.0.0.0. Producción selecciona 0.0.0.0 y requiere
PORT y origen HTTPS exacto, sin ruta ni comodines. HOST puede restringirse a
127.0.0.1 para una comprobación local explícita de producción.

`server.ts` valida JWT y configuración HTTP, y espera la apertura del pool con
política TLS validada: base/rol, ausencia de privilegios administrativos y todas
las columnas esperadas. Solo entonces monta la API existente y abre HTTP.
No ejecuta DDL ni utiliza el migrador. Los errores de arranque usan mensajes
propios, sin el error original del driver ni cadenas de conexión.
SIGINT/SIGTERM dejan de aceptar solicitudes, esperan HTTP y cierran el pool.
Tras 10 s se cierran conexiones HTTP que siguen abiertas; no se cambia el COMMIT
ni se responde éxito antes de confirmar. El cierre sigue siendo idempotente.

En Windows se comprobaron el cierre de la función y ambos comandos habituales;
las señales/plazos reales del hosting Linux quedan por comprobar en Render.
Los fallos posteriores de conexión conservan HTTP 503. Se mantienen npm run dev,
npm run build y npm start del backend. El lanzador DPAPI privado no cambió;
`.env` y JWT_SECRET reales no fueron sobrescritos. El hosting suministrará sus
valores privados, sin recibir el archivo DPAPI de esta PC. Ver
[produccion.env.example](produccion.env.example) y [variables del README](../README.md#configuración-local).

### Una política TLS para API y herramientas

`src/db/seguridad-postgres.ts` se comparte entre el pool y postgres-config.mjs.
Los scripts importan TypeScript nativo con Node 24, sin cargar Express ni requerir
build. El servidor compilado utiliza la versión JavaScript del módulo.

| Variable | Local | Producción |
| --- | --- | --- |
| DATABASE_SSL_MODE | Predeterminado disable | Predeterminado y obligatorio verify-full |
| DATABASE_SSL_CA_FILE | Opcional solo con verify-full | Opcional para una CA propia confiable |

verify-full aplica `ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }`, con
las CA de Node o el archivo CA indicado. Se verifican cadena y nombre del servidor.
La CA es un certificado público, pero debe obtenerse de una fuente confiable.
El archivo no se imprime ni se divulga su ruta ante errores. No hay excepciones
para certificados inválidos ni reintentos sin cifrado.

Las URLs no admiten parámetros. TLS se separa de la URL porque los parámetros SSL
de pg pueden reemplazar su objeto ssl; tampoco pueden sustituirse base, usuario o
host. Ver [TLS en pg](https://node-postgres.com/features/ssl).
Se conservan las comprobaciones de identidad y permisos mínimos, y los límites
del pool: 5 conexiones, espera de conexión de 5 s y consultas de 10 s.

La [documentación de Render](https://render.com/docs/postgresql-creating-connecting)
describe certificado interno autofirmado y externo administrado. No se da por
válida la conexión interna ni se desactiva la verificación. La instancia real
deberá ofrecer una ruta verificable: evaluar la externa con acceso de red
restringido o una CA confiable si está disponible. Ruta, región y acceso de red
siguen pendientes; no se comprobó ninguna conexión remota.

No se flexibilizaron los nombres exigidos (psique/psique_app, migrador y pruebas).
Antes de publicar hay que verificar cómo crear esos roles/nombres en la instancia
administrada. La migración 001 conserva sus bytes y checksum; sus dependencias del
entorno local deberán revisarse en una etapa autorizada. No se ejecutaron
migraciones sobre desarrollo en 4B ni se cambiaron tablas o permisos.

### Seguridad HTTP y disponibilidad

`src/seguridad-http.ts` utiliza Helmet 8 y express-rate-limit 8, mantenidos y
compatibles con Express 5. Evitan implementar manualmente cabeceras y contadores
por IP. Ver [Helmet](https://helmet.js.org/) y
[express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration).

- CORS admite un origen exacto y GET/POST/PUT. Preflight valida Authorization y
  Content-Type y devuelve solo los encabezados solicitados. Lo no autorizado
  recibe 403, sin cookies ni origen `*`. Sin Origin se permite atender herramientas
  HTTP; las rutas privadas continúan exigiendo JWT.
- Registro: 10 solicitudes/hora; login: 30/15 minutos por IP o IPv6 /56. Se
  ejecutan antes de consultas/Argon2. Cuentan también solicitudes inválidas y
  correctas; 429 y Retry-After usan un mensaje genérico sin email. No se modificaron
  JWT, Argon2id, expiración ni el 409 previo de registro por email duplicado.
- La memoria se pierde al reiniciar y no se comparte con réplicas. NAT/proxies
  pueden agrupar usuarios. Es protección básica para una instancia; no resuelve
  ataques distribuidos y no se incorporó Redis.
- trust proxy es false por defecto. TRUSTED_PROXY_CIDRS solo admite IP/redes
  explícitas separadas por coma; nunca true, cantidad de saltos o /0. Un cliente
  directo no evade el cupo falsificando X-Forwarded-For. Detrás de Render sin redes
  verificadas, sus clientes podrían compartir cupo. Antes de publicar hay que
  comprobar cadena, encabezados saneados y redes reales; no habilitar confianza
  universal para resolver una configuración incompleta. Ver
  [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
- Helmet aplica nosniff, referrer-policy, control de marcos y CSP restrictiva a
  la API JSON. HSTS se activa solo en producción. Las cabeceras del Static Site
  se configurarán y probarán aparte; no se impuso una CSP a Ionic/Angular.
- Todas las respuestas, también errores, tienen no-store. Se retiran ETag y
  X-Powered-By; el límite JSON se conserva en 32 KB.

`src/disponibilidad.ts` monta /health/live (200 sin SQL) y /health/ready (200/503).
Son públicos: solo devuelven `{ "estado": "ok" }` o `{ "estado": "no_disponible" }`,
sin datos de usuarios o infraestructura. Readiness ejecuta SELECT 1, cachea 5 s y
comparte una consulta en vuelo. Responde en aproximadamente 1,5 s aunque SQL no
conteste; no inicia otra consulta hasta que termine la anterior. SQL mantiene los
límites del pool. Un resultado positivo puede permanecer hasta 5 s tras una caída;
no es una garantía por cada operación. El futuro health check será /health/ready.

### Pruebas ejecutadas y alcance

| Verificación | Resultado local del 19/10/2026 |
| --- | --- |
| Backend build | Correcto. |
| npm test backend | 74 resultados SQLite aprobados; pruebas históricas sin modificaciones. |
| Lanzador -Tarea probar | 123 resultados PostgreSQL aprobados, ninguno omitido. |
| test-postgres/seguridad.test.mjs | 15 casos nuevos incluidos en esos 123. |
| Contrato compartido | 186 respuestas HTTP por motor, mismos contratos clínicos. |
| npm run test:config raíz | 4 casos: configuración e interceptor Angular real local/producción. |
| Angular build local/producción | Correctos; dominio reservado de prueba, sin conexión remota. |
| Inicio compilado/watch | Verificados con lanzador original, psique_app/psique y salud 200. |
| Desarrollo | Cuatro tablas vacías, sin cuentas de ejemplo. |
| Navegador | Inventario vacío e integrado no disponible; no se repitió recorrido visual de 3C. |

Los casos nuevos cubren configuración válida/incompleta, escucha local/pública,
CORS/preflight, 429 antes de SQL/hashing, falsificación de IP, cabeceras, no-store,
health sin secretos, cache/espera acotada, TLS inválido, logs seguros y HTTP 503.
La escucha de producción usa SQL simulado dentro de ese caso; no es una conexión
Render. El arranque y health locales sí consultaron PostgreSQL real de pruebas.

La prueba TLS realiza un handshake PostgreSQL contra un servidor TLS local efímero:
rechaza una CA no confiable y después un nombre incorrecto aun confiando en esa CA
ficticia. Usa OpenSSL (Git para Windows), claves temporales y no credenciales reales;
se omite expresamente si ese ejecutable no existe en Windows. En esta ejecución
no fue omitida.

Angular conserva npm start y npm run build para local. El build remoto explícito
build:production exige PSIQUE_API_URL. Sus pruebas ejecutan el interceptor original
y verifican origen/ruta, endpoints públicos, otros dominios, 401 y descarte de
respuestas de una cuenta cerrada. Usan Node y el empaquetador ya instalado por
Angular; no se agregó un framework. No se afirma haber revalidado visualmente
pantallas en esta sesión. El último recorrido visual completo sigue siendo 3C.

La diferencia inicial del formato de preflight con la prueba histórica se corrigió
reflejando solo encabezados solicitados y previamente validados, sin cambiar esa
prueba ni contratos clínicos. Los comandos normales compilados y watch funcionan.
Los errores TLS al reconectar también se clasifican como indisponibilidad 503,
sin aceptar certificados inválidos ni convertirlos en credenciales incorrectas.

Se compararon hashes de 61 archivos protegidos: 60 idénticos y solo api.config.ts
con el cambio previsto. Incluyen `.env`, dos bases SQLite, tres respaldos y
migración 001. La revisión de 119 archivos no encontró las tres contraseñas
PostgreSQL reales ni el secreto JWT. Ambas bases terminaron sin registros ficticios.

### Archivos de esta etapa

| Grupo | Archivos creados o modificados en 4B |
| --- | --- |
| Angular | angular.json; src/app/api.config.ts; src/environments/environment.ts, environment.production.ts y configuracion-api.ts |
| Compilación/pruebas frontend | scripts/compilar-produccion.mjs; test-config/frontend.test.mjs; package.json y package-lock.json de la raíz |
| Arranque/API | src/server.ts; src/app-postgres.ts; src/api.ts; src/auth.ts |
| Configuración/seguridad | src/configuracion.ts; src/seguridad-http.ts; src/disponibilidad.ts |
| PostgreSQL | src/db/postgres.ts; src/db/seguridad-postgres.ts; scripts/postgres-config.mjs |
| Pruebas backend | test-postgres/seguridad.test.mjs |
| Dependencias/backend | package.json y package-lock.json: Helmet y express-rate-limit |
| Ejemplos | .env.example; postgres.env.example; postgres-test.env.example; produccion.env.example |
| Documentación | README.md de la raíz y este documento |

Las rutas de esta tabla son relativas a backend salvo las indicadas como raíz
o frontend. Otros cambios que ya estuvieran pendientes de etapas anteriores no
se atribuyen a 4B. No se hizo una reorganización general del proyecto.

Pendientes sobre Render real: URLs, región, roles/permisos y esquema, TLS/acceso de
red, proxy, terminación HTTPS, SPA/cabeceras del Static Site, señales/reinicios,
recorrido visual, costos y backups operativos. No se creó Blueprint, workflow,
servicio o dominio. Los conceptos para defensa están en
[README](../README.md#conceptos-para-la-defensa-oral).

## Archivos y comandos

| Archivo | Responsabilidad |
| --- | --- |
| `migrations/001_esquema_inicial.sql` | Cuatro tablas funcionales, claves, restricciones, índices y permisos. |
| `scripts/migrar.mjs` | Lee versiones SQL, comprueba su historial y ejecuta las pendientes. |
| `scripts/postgres-config.mjs` | Configuración por entorno, validación del destino y errores sin secretos. |
| `scripts/verificar-postgres.mjs` | Comprueba integridad y permisos en desarrollo sin cambiar registros. |
| `src/db/postgres.ts` | Abre y comprueba el pool PostgreSQL; clasifica problemas de disponibilidad. |
| `src/auth-postgres.ts` | Consultas de usuarios PostgreSQL y manejador HTTP 503. |
| `src/auth.ts` | Comparte validación, Argon2id y JWT; conserva el adaptador SQLite histórico. |
| `src/api.ts` | Rutas, CORS, JSON, respuestas y errores compartidos entre ambos motores. |
| `src/reglas-api.ts` | Validaciones de reservas y sesiones, ficha inmutable, calendario de consultas y etiquetas. |
| `src/app.ts` | Consultas y transacciones SQLite conservadas para referencia y pruebas históricas. |
| `src/server.ts` | Arranque PostgreSQL habitual, validación previa, escucha por entorno y cierre HTTP/pool. |
| `src/configuracion.ts`, `src/seguridad-http.ts`, `src/disponibilidad.ts` | Configuración, seguridad HTTP y comprobaciones de salud. |
| `src/db/seguridad-postgres.ts` | Política TLS compartida por pool y herramientas. |
| `src/app-postgres.ts` | Monta autenticación y negocio exclusivamente PostgreSQL con un pool ya comprobado. |
| `src/db/consultorio-postgres.ts` | Consultas, proyecciones JSON, transacciones y bloqueo por profesional. |
| `scripts/comprobar-pool.mjs` | Comprueba `DATABASE_URL` con el rol de aplicación y cierra el pool, sin iniciar HTTP. |
| `test-postgres/` | Esquema, migrador, autenticación, API y comparación con SQLite temporal. |
| `postgres.env.example`, `postgres-test.env.example` | Nombres de variables sin contraseñas; se completan fuera del repositorio. |

Desde `backend`, con las variables correspondientes disponibles en el proceso:

| Comando | Destino y función |
| --- | --- |
| `npm.cmd run db:status` | Consulta versiones aplicadas y pendientes en `psique`; no crea tablas. |
| `npm.cmd run db:migrate` | Aplica migraciones pendientes en `psique` como `psique_migrador`. |
| `npm.cmd run db:status:test` | Consulta el estado en `psique_test`. |
| `npm.cmd run db:migrate:test` | Prepara el mismo esquema en `psique_test` como `psique_test`. |
| `npm.cmd run db:verify` | Comprueba permisos, restricciones y cantidades de desarrollo. |
| `npm.cmd run test:postgres` | Ejecuta exclusivamente las pruebas PostgreSQL. |
| `npm.cmd run test:postgres:auth` | Compila el backend y ejecuta solo las pruebas de autenticación PostgreSQL. |
| `npm.cmd run test:postgres:api` | Compila y comprueba la API completa, su equivalencia y concurrencia. |
| `npm.cmd run test:postgres:server` | Comprueba configuración, arranque, cierre y persistencia del servidor. |
| `npm.cmd run dev`, `npm.cmd start` | Inician Express exclusivamente con `DATABASE_URL` de `psique_app`/`psique`. |
| `npm.cmd run db:connect` | Abre y cierra un pool como `psique_app`; no crea usuarios ni activa otro servidor. |
| `npm.cmd test` | Conserva las pruebas existentes de la API con SQLite temporal. |

Los scripts de migración son JavaScript ESM y utilizan `pg`. No requieren compilar
TypeScript ni importar el servidor Express. Las pruebas PostgreSQL compilan primero
el backend para comprobar los módulos TypeScript preparados. La comprobación del
pool utiliza el soporte TypeScript de Node 24. `dev` y `start` usan PostgreSQL
obligatoriamente; no ejecutan migraciones ni seleccionan otro motor ante un fallo.

## Credenciales y ejecución local

Los roles PostgreSQL son cuentas técnicas, diferentes de los profesionales que
se registran en PSIQUE. Ninguno de los tres tiene superusuario, `CREATEDB`,
`CREATEROLE`, replicación, `BYPASSRLS` ni pertenencia a los otros roles.

| Variable | Rol y base exigidos |
| --- | --- |
| `MIGRATION_DATABASE_URL` | `psique_migrador` conectado a `psique`. |
| `APP_DATABASE_URL` | `psique_app` conectado a `psique`; solo se usa para verificar permisos en esta etapa. |
| `DATABASE_URL` | Conexión obligatoria del servidor habitual: exclusivamente `psique_app` conectado a `psique`. |
| `TEST_DATABASE_URL` | `psique_test` conectado a `psique_test`. |

Las URLs incluyen host, puerto, base, rol y contraseña. No deben escribirse en
archivos versionados, argumentos visibles de comandos ni resultados de pruebas.
Los ejemplos tienen valores vacíos. Las herramientas no cargan ni cambian el
`.env` que usa actualmente Express.

En esta computadora las claves de la etapa 1 siguen cifradas mediante DPAPI,
fuera del proyecto, en la carpeta local `PSIQUE/postgresql-local`. Un lanzador
privado las descifra en memoria, configura únicamente las variables necesarias
para cada comando y las restaura al terminar. Puede utilizarse desde PowerShell:

```powershell
$herramientasPsique = Join-Path $env:LOCALAPPDATA 'PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1'
& $herramientasPsique -Tarea estado
& $herramientasPsique -Tarea migrar
& $herramientasPsique -Tarea migrar-pruebas
& $herramientasPsique -Tarea estado-pruebas
& $herramientasPsique -Tarea probar
& $herramientasPsique -Tarea probar-auth
& $herramientasPsique -Tarea probar-api
& $herramientasPsique -Tarea probar-arranque
& $herramientasPsique -Tarea conexion
& $herramientasPsique -Tarea verificar
# Uno por vez, en la terminal del backend:
& $herramientasPsique -Tarea dev
# O después de compilar backend:
& $herramientasPsique -Tarea iniciar
```

Este lanzador es específico de la computadora y no contiene claves en claro.
Si se mueve el proyecto, admite `-Proyecto` con su nueva ruta. En otro entorno,
las mismas herramientas reciben las variables mediante el mecanismo privado
disponible. Node también permite cargar un archivo externo, por ejemplo:

```powershell
# Desde backend; la ruta es ilustrativa y no incluye ninguna credencial.
node --env-file=C:\Privado\postgres.env scripts/migrar.mjs --status
node --env-file=C:\Privado\postgres-test.env scripts/migrar.mjs --test
node --env-file=C:\Privado\postgres-test.env --test --test-concurrency=1 test-postgres/*.test.mjs
```

El entorno de pruebas debe contener únicamente `TEST_DATABASE_URL`, sin las
credenciales `DATABASE_URL`, `APP_DATABASE_URL` o `MIGRATION_DATABASE_URL`.
El lanzador local las retira mientras ejecuta las pruebas y luego restaura el entorno.
Se comprueban la URL antes de conectar y la base,
rol, propietario y atributos que devuelve el servidor antes de ejecutar SQL.
No se acepta el superusuario `postgres` para migraciones o pruebas. La separación
de permisos también impide que el rol de pruebas se conecte a desarrollo.

## Tablas, relaciones y restricciones

Los nombres camelCase se conservan entre comillas SQL: `"usuarioId"`,
`"passwordHash"`, `"fechaCreacion"`, etc. PostgreSQL transforma a minúsculas los
identificadores escritos sin comillas.

| Tabla | Datos, claves y relaciones |
| --- | --- |
| `usuarios` | `id` autogenerado, email, hash y creación de cuenta. PK `id`; índice único `lower(email)`. |
| `pacientes` | `usuarioId`, código, modalidad, estado, próxima sesión, frecuencia, día y horario habituales, fechas de creación e inicio, motivo y Post-it. PK `(usuarioId, codigo)` y FK al usuario. |
| `turnos` | Profesional, fecha, hora, paciente opcional, modalidad opcional y estado. PK `(usuarioId, fecha, horario)`; FK al usuario y FK `(usuarioId, codigoPaciente)` al paciente. |
| `sesiones` | ID autogenerado, profesional, fecha, hora, paciente, modalidad, estado y dos importes. PK `id`; horario único por profesional; FK al usuario, al paciente y al turno con claves compuestas. |
| `migraciones` | Tabla técnica: versión, nombre de archivo, checksum y momento de aplicación. No representa una nueva función clínica. |

`codigo` admite los mismos caracteres ASCII y entre 1 y 12 posiciones; `nuevo`
continúa reservado. El índice único `(usuarioId, lower(codigo))` impide duplicados
por mayúsculas dentro de una cuenta. La PK exacta se conserva para las relaciones.
La colación `C` de los códigos mantiene una comparación y orden binarios.

Se mantienen modalidades `Presencial` y `Virtual`; turnos `Disponible`,
`Programado` o `Liberado`; sesiones `Programada` o `Realizada`. Un turno programado
requiere paciente y modalidad; uno disponible o liberado requiere ambos en `NULL`.

Estado de tratamiento y frecuencia siguen admitiendo texto personalizado de
hasta 40 caracteres. También se conservan los límites de próxima sesión (30),
motivo (3000), Post-it (300) y los siete días habituales. Los tres campos opcionales
del paciente son próxima sesión, día y horario habituales. Motivo y Post-it son
obligatorios pero pueden contener una cadena vacía.

Las claves foráneas incluyen `usuarioId`. Por ejemplo, `(A, P-001)` y `(B, P-001)`
son pacientes diferentes. Una referencia `(A, SOLO-B)` falla si ese código existe
únicamente para B. Las referencias a turnos también incluyen al profesional.
Las seis FK se verifican directamente desde PostgreSQL; no hay borrado en cascada.

Estas restricciones no filtran un `SELECT` ni sustituyen el middleware JWT y los
filtros de Express. Tampoco sincronizan por sí solas paciente y modalidad entre
turno y sesión: eso continúa siendo responsabilidad de la transacción de negocio.
No se implementó Row-Level Security ni se agregaron triggers funcionales.

## Tipos y diferencias con SQLite

| Dato | PostgreSQL | Conversión aplicada en la API |
| --- | --- | --- |
| ID de usuario o sesión | `INTEGER GENERATED BY DEFAULT AS IDENTITY` | Devuelve números; permite inserción explícita cuando corresponde. Su rango es de 32 bits. |
| Fechas de calendario | `DATE` | Deben volver a JSON como `YYYY-MM-DD`, sin desplazamientos por zona horaria. Se admite el rango actual de años 0001 a 9999. |
| Horarios | `TIME WITHOUT TIME ZONE` | Se exige segundo cero y hora menor que 24:00. La API los proyecta como `HH:mm`. |
| Creación de cuenta | `TIMESTAMPTZ(3)` | Conserva el instante y precisión de milisegundos; salida ISO UTC. |
| Importes | `INTEGER` | Centavos entre 0 y 999999999; lo cobrado entre cero y los honorarios. |
| Textos | `TEXT` | Se mantienen campos, nulabilidad y validaciones, sin enums nuevos. |

La generación de IDs utiliza las [columnas de identidad de PostgreSQL](https://www.postgresql.org/docs/18/ddl-identity-columns.html).

En SQLite las fechas y horas eran texto. `pg` puede devolver `DATE` y
`TIMESTAMPTZ` como objetos `Date`, y `TIME` con segundos. Los endpoints PostgreSQL
proyectan fechas y horarios con `to_char(fecha, 'YYYY-MM-DD')` y
`to_char(horario, 'HH24:MI')`, sin transformar días de calendario en instantes UTC.
Los contadores usan `COUNT(*)::integer` para evitar cadenas JSON.
Ver [tipos de pg](https://node-postgres.com/features/types).

`passwordHash` almacena el resultado de Argon2id calculado por la autenticación;
el esquema no calcula hashes ni crea contraseñas. Las validaciones de solicitudes,
normalización de textos, fecha de creación inmutable y realización manual de
sesiones siguen perteneciendo al backend actual.

Los índices explícitos son email único, código único por profesional y
`sesiones_paciente(usuarioId, codigoPaciente)`. Las PK y la unicidad de horario
generan sus propios índices; no se duplicaron ni se agregaron índices anticipados.

Las secuencias PostgreSQL pueden dejar huecos cuando una transacción se revierte.
Esto es normal: el ID identifica un registro y no representa una numeración sin saltos.

## Cambio de código mediante restricciones diferibles

`turnos_paciente_fk` y `sesiones_paciente_fk` son
`ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE`. Normalmente se verifican al
terminar cada sentencia. Para cambiar un código se podrá usar esta secuencia:

1. Comenzar una transacción.
2. Ejecutar `SET CONSTRAINTS turnos_paciente_fk, sesiones_paciente_fk DEFERRED`.
3. Actualizar paciente, turnos y sesiones, siempre filtrando por profesional.
4. Confirmar con `COMMIT`; si quedan referencias inválidas, PostgreSQL rechaza la confirmación.

`SET CONSTRAINTS ... IMMEDIATE` permite adelantar esa comprobación antes del commit.
La etapa 3B aplica esta secuencia al editar el código, dentro de la transacción
del profesional. Ver [restricciones diferibles](https://www.postgresql.org/docs/18/sql-set-constraints.html).

## Versionado y transacciones de migraciones

Los archivos siguen el formato `001_descripcion.sql`, `002_otro_cambio.sql`, etc.
El script los ordena por versión numérica y rechaza versiones duplicadas o inválidas.
Un bloqueo de sesión evita que dos migradores trabajen simultáneamente sobre
el historial de una misma base.

El migrador crea la tabla técnica si falta. Cada archivo pendiente se ejecuta
con `BEGIN`, su SQL y el registro de versión; después confirma todo con `COMMIT`.
Ante un error ejecuta `ROLLBACK`: esa migración no deja tablas, datos ni una
versión aplicada parcialmente. Las versiones anteriores confirmadas se conservan.
Si falla la primera migración, puede quedar la tabla técnica vacía preparada.
Todos los pasos usan el mismo cliente, como requiere [pg para las transacciones](https://node-postgres.com/features/transactions).

El historial incluye SHA-256 del contenido normalizado a saltos LF. Cambiar entre
CRLF y LF no altera el checksum. Cambiar una migración aplicada, quitarla o insertar
una versión anterior a la última aplicada detiene el proceso. Se debe conservar el
archivo original y agregar otra versión; no editar el historial para forzar su ejecución.

Los archivos SQL no deben incluir `BEGIN`, `COMMIT` ni `ROLLBACK`: los administra
el script. Esta etapa utiliza operaciones transaccionales; una operación que no
admita transacción, como `CREATE INDEX CONCURRENTLY`, requiere otro procedimiento.
No se implementaron reversiones automáticas de migraciones confirmadas.

## Permisos

En `psique`, el propietario de los objetos es `psique_migrador`. `psique_app`
tiene `SELECT`, `INSERT` y `UPDATE` sobre las cuatro tablas y `USAGE` sobre las
dos secuencias de identidad. No tiene `DELETE`, `TRUNCATE`, creación de objetos,
modificación de restricciones ni permisos sobre `migraciones`. Ver [privilegios de PostgreSQL](https://www.postgresql.org/docs/18/ddl-priv.html).

En `psique_test`, el propietario es `psique_test`. Se usa el mismo SQL para crear
las tablas; la concesión a `psique_app` se realiza únicamente en desarrollo.
No se concedió acceso de la aplicación a la base de pruebas ni acceso del rol de
pruebas a desarrollo. No se cambiaron permisos globales del servidor.

`db:verify` comprueba el catálogo y las operaciones de la aplicación. Sus
`SELECT`, `INSERT ... SELECT ... WHERE false` y `UPDATE ... WHERE false` afectan
cero filas y no consumen IDs. Los intentos prohibidos de crear o eliminar tablas,
modificar restricciones y borrar registros se ejecutan dentro de transacciones
que siempre se revierten. No utiliza `TRUNCATE` ni borra datos para verificar permisos.

## Pruebas e integridad

`test:postgres` usa archivos secuenciales y conexiones limitadas a
`psique_test`/`psique_test`. Los casos de concurrencia abren varias conexiones
dentro de una prueba. Los usuarios y datos son ficticios y normalmente se
revierten mediante transacciones. Los artefactos de migración de prueba se
identifican con UUID y se limpian únicamente con la conexión protegida de pruebas.
No se limpia la base completa ni se ejecutan estas pruebas sobre desarrollo.

Se comprueban tablas, PK, FK, nulabilidad, identidad, unicidad, referencias por
profesional, estados, textos, importes, fechas, horarios, renombrados diferidos,
rechazo al confirmar referencias incompletas, permisos, checksum, repetición,
concurrencia y reversión ante un fallo SQL intermedio.

Para consultar manualmente el historial desde la conexión del migrador:

```sql
SELECT version, archivo, checksum, "aplicadaEn" FROM public.migraciones ORDER BY version;
SELECT conname, convalidated FROM pg_constraint WHERE connamespace = 'public'::regnamespace;
SELECT 'usuarios' AS tabla, count(*) FROM public.usuarios
UNION ALL SELECT 'pacientes', count(*) FROM public.pacientes
UNION ALL SELECT 'turnos', count(*) FROM public.turnos
UNION ALL SELECT 'sesiones', count(*) FROM public.sesiones;
```

## Conceptos para explicar en la defensa

| Concepto | Explicación aplicada a PSIQUE |
| --- | --- |
| Clave primaria | Identifica cada fila sin duplicados; por ejemplo, el ID de sesión. |
| Clave compuesta | Usa varios campos; el paciente se identifica por profesional y código. |
| Clave foránea | Exige que una referencia exista; una sesión necesita un paciente y un turno válidos. |
| Integridad referencial | Evita referencias huérfanas o asociadas al profesional incorrecto. |
| `UNIQUE` | Impide duplicados; una cuenta no puede tener dos sesiones en el mismo horario. |
| `CHECK` | Comprueba una condición de la fila; por ejemplo, cobrado menor o igual que honorarios. |
| Índice | Facilita encontrar filas; un índice único también impide duplicaciones. |
| Transacción | Agrupa operaciones que deben confirmarse juntas. |
| Rollback | Revierte los cambios no confirmados si ocurre un error. |
| Migración | Archivo que define un cambio del esquema. |
| Versionado | Registra qué cambios se aplicaron, en orden, para no repetirlos ni alterar su historia. |
| Roles separados | La aplicación opera con datos; el migrador administra estructura. |
| `usuarioId` | Identifica al propietario y forma parte de filtros y relaciones para separar cuentas. |

## Resultado de la etapa 2

Verificación realizada el **13/10/2026**:

- `001_esquema_inicial.sql` aplicada en `psique` y `psique_test`.
- 23 pruebas PostgreSQL aprobadas, sin casos omitidos.
- 74 resultados aprobados de las pruebas existentes de la API SQLite (69 casos y cinco contenedores).
- Compilación de backend y frontend correcta; frontend sin advertencias.
- Permisos de aplicación verificados con operaciones reales; cero filas modificadas en desarrollo.
- Renombrados diferidos, migración fallida y dos migradores concurrentes comprobados.
- Migrador ejecutado nuevamente en ambas bases: cero versiones nuevas y ninguna pendiente.
- Comparación SHA-256 de las dos bases SQLite, tres respaldos y código fuente: sin diferencias en los 70 archivos controlados.

Durante las primeras pruebas se ajustó una consulta de catálogo: los nombres de
columnas se devolvían como `name[]`; convertirlos a `text[]` permitió comprobar
las claves como arreglos sin agregar parsers globales ni cambiar los modelos.

La etapa 3A prepara la autenticación de manera aislada, como se detalla a continuación.

## Etapa 3A: conexión y autenticación aisladas

### Conexión y pool

Una conexión es una sesión autenticada entre Node y PostgreSQL. Un pool conserva
varias conexiones y las reutiliza entre solicitudes, evitando abrir una por cada
petición. `abrirPoolPostgres()` crea un único pool para la instancia que lo consume,
con un máximo predeterminado de **cinco conexiones**, espera de conexión de **cinco
segundos**, cierre de conexiones ociosas a los **30 segundos** y límite de consulta
de **diez segundos**. Las pruebas pueden reducir límites para comprobar saturación.

La función exige `DATABASE_URL` con `psique_app`/`psique`, o `TEST_DATABASE_URL`
con `psique_test`/`psique_test` cuando se solicita explícitamente el entorno de pruebas.
No utiliza las credenciales del migrador. Comprueba la identidad del servidor,
ausencia de atributos administrativos y acceso a `usuarios` antes de devolver el
pool. Una conexión fallida impide montar un servidor que dependa de ese resultado;
no crea esquema ni carga datos automáticamente.

`pool.query()` toma una conexión disponible, ejecuta una consulta y la devuelve.
La autenticación usa consultas independientes, por lo que no necesita mantener
una conexión prestada mientras Argon2 calcula el hash. Un proceso futuro que use
PostgreSQL debe esperar el pool antes de escuchar HTTP y, al terminar, dejar de
aceptar solicitudes y ejecutar `await pool.end()`.

Los errores de conexiones ociosas se capturan mediante un listener que registra
solo un mensaje fijo. `pg` retira esa conexión y puede reemplazarla. Ver
[pooling](https://node-postgres.com/features/pooling) y [API del pool](https://node-postgres.com/apis/pool).

### Lógica compartida y consultas asíncronas

`auth.ts` conserva el punto de entrada histórico `configurarAutenticacion(app, db, ...)`,
que selecciona SQLite para sus pruebas. Las tres operaciones de usuarios se entregan
a una función común: buscar por email, insertar y comprobar existencia por ID.
La clasificación de duplicados se delega al adaptador de cada motor.

`configurarAutenticacionPostgres(app, pool, ...)` proporciona esas consultas mediante
`pg`. No abre SQLite ni monta pacientes, agenda, sesiones, honorarios o Dashboard.
No se agregó un selector automático por variables de entorno ni un segundo servidor
permanente. La función solo se monta en instancias Express de prueba en esta etapa.

SQLite ejecuta estas consultas de forma síncrona dentro del proceso. PostgreSQL
responde a través de una conexión de red: `async` permite devolver una promesa y
`await` espera su resultado sin bloquear el procesamiento de otras solicitudes.
Agregar `await` no crea una transacción automáticamente.

Las consultas parametrizadas separan el SQL de los valores:

```typescript
const resultado = await pool.query(
  'SELECT id, email FROM public.usuarios WHERE lower(email) = lower($1)',
  [email],
);
```

`$1` corresponde al primer valor del arreglo; `$2`, al segundo. El email y la
contraseña hasheada nunca se concatenan dentro del SQL. Ver
[consultas parametrizadas](https://node-postgres.com/features/queries).

### Registro, login y JWT

Se conservan `POST /api/auth/registro` y `POST /api/auth/login`, sus cuerpos,
validaciones, mensajes y respuestas. El email se recorta y normaliza a minúsculas;
la contraseña no se modifica y en registro mantiene el límite de 12 a 128 caracteres.

El registro comprueba el email, calcula Argon2id e inserta mediante parámetros.
`INSERT ... RETURNING` recupera el ID, email e instante de creación. La fecha
`TIMESTAMPTZ` se convierte con `toISOString()` al formato anterior; el ID continúa
siendo numérico. La respuesta 201 solo contiene los datos públicos del usuario.

Dos solicitudes pueden superar simultáneamente la comprobación previa. La garantía
definitiva es `usuarios_email_unico`: SQLSTATE `23505` con ese nombre se traduce
al mismo 409 y mensaje de email duplicado. No se interpretan otros errores SQL como
duplicaciones.

El login busca el hash, comprueba la contraseña exacta mediante `argon2.verify`
y genera el mismo JWT HS256 de una hora, con `sub`, `iat`, `exp`, `iss` y `aud`.
Una contraseña incorrecta y un usuario inexistente reciben el mismo 401. La
respuesta mantiene `{ token, usuario, expiraEn }`, sin hash ni contraseña.

El middleware conserva Bearer, firma, algoritmo, emisor, audiencia, claims y
vencimiento; luego consulta si el usuario sigue existiendo y coloca su ID en
`res.locals.usuarioId`. Esa consulta queda fuera del catch que transforma los
fallos de JWT en 401. Un ID seguro de JavaScript que exceda el rango INTEGER de
PostgreSQL se trata como usuario inexistente, evitando un desbordamiento SQL.

### Errores y separación de motores

| Situación | Resultado |
| --- | --- |
| Datos de entrada inválidos | Mismo 400 y mensaje que SQLite. |
| Email duplicado | Mismo 409. |
| Credenciales web incorrectas o JWT inválido/vencido | Mismo 401. |
| Conexión interrumpida, espera del pool agotada o pool cerrado | 503 con mensaje fijo de servicio no disponible. |
| Error SQL inesperado | 500 genérico, sin detalles internos. |
| Configuración o disponibilidad incorrecta al abrir el pool | Se rechaza el inicio antes de escuchar HTTP. |

`manejarDisponibilidadPostgres` debe montarse después de las rutas, antes del
manejador general de errores. No se imprimen errores originales de `pg`, URLs,
contraseñas ni tokens. Los errores HTTP de promesas rechazadas siguen el mecanismo
de [Express 5](https://expressjs.com/en/guide/error-handling/).

Mezclar autenticación PostgreSQL con datos clínicos SQLite sería peligroso:
los IDs de usuarios de ambas bases se generan independientemente y podrían
coincidir para profesionales distintos. Durante la etapa 3A la aplicación normal utilizaba
SQLite en autenticación y negocio; su instancia PostgreSQL de prueba tenía
solo autenticación y una ruta artificial para verificar identidad, con clave
JWT efímera. No recibe el secreto JWT real ni se conecta con el frontend.

### Pruebas y resultado de la etapa 3A

```powershell
# Desde backend, con TEST_DATABASE_URL y sin credenciales de desarrollo.
npm.cmd run test:postgres:auth
npm.cmd run test:postgres
# La suite histórica usa SQLite temporal.
npm.cmd test
```

Cada instancia de prueba abre un puerto efímero en localhost, espera la disponibilidad
del pool y cierra servidor y conexiones al terminar. Los emails ficticios contienen
un UUID propio. La limpieza utiliza exclusivamente el rol de pruebas y ese prefijo;
no vacía tablas completas ni elimina registros de otras instancias.

Se probaron registros correctos, validaciones, hashes con sales distintas, email
duplicado y concurrente, login, contraseñas exactas, todos los controles JWT,
usuarios eliminados, IDs fuera de rango y ausencia de rutas clínicas. Los fallos
incluyen puerto inaccesible, pool cerrado, saturación y recuperación, fallo de
transporte simulado durante INSERT y error SQL simulado. También se interrumpió
una conexión ociosa propia de `psique_test` para comprobar la recuperación real
del pool sin detener PostgreSQL ni afectar otras cuentas.

Verificación realizada el **13/10/2026**:

- **19 pruebas de autenticación PostgreSQL aprobadas**.
- **42 pruebas PostgreSQL aprobadas en conjunto**: las 19 nuevas y las 23 de esquema/migraciones.
- **74 resultados aprobados de la suite SQLite existente** (69 casos y cinco contenedores).
- Compilaciones de backend y frontend correctas; frontend sin advertencias.
- Pool abierto y cerrado con el rol real `psique_app`, sin escribir en desarrollo.
- `psique` y `psique_test` sin usuarios ni datos clínicos de prueba permanentes.
- Comprobación HTTP de la aplicación local: frontend 200, rutas privadas sin token 401 y login inexistente 401.
- Hashes sin cambios en 71 archivos protegidos: frontend, negocio, migración 001, bases SQLite, respaldos y `.env` actual.
- Revisión de 25 archivos de código y documentación: ninguna coincidencia con las tres contraseñas PostgreSQL reales ni el secreto JWT actual.

No se modificó `001_esquema_inicial.sql` ni se crearon migraciones nuevas. Se
resolvieron dos diferencias relevantes en el adaptador: fechas devueltas como
`Date` e IDs JWT que podrían exceder INTEGER. La primera prueba de JSON `null`
se ajustó al mensaje que ya devuelve el parser de Express, conservando el contrato.

La etapa 3B implementó esas operaciones a continuación; la etapa 3C habilitó
el motor en el servidor habitual, como se detalla al final.

## Etapa 3B: API completa aislada

### Organización y alcance

`crearAppPostgres(pool, origen, reloj, secreto)` monta registro, login, middleware
JWT y todos los endpoints de pacientes, agenda, horarios, sesiones y Dashboard.
Los honorarios, cobros e histórico conservan sus endpoints actuales de sesiones.
Esta función no abre SQLite, no escucha un puerto por sí misma ni administra otro
servidor permanente. Las pruebas esperan `abrirPoolPostgres({ pruebas: true })`,
abren Express en localhost con puerto efímero y cierran HTTP antes del pool.

Para evitar dos copias de las rutas, `api.ts` recibe un objeto con las operaciones
del consultorio. No hay ORM ni un framework de persistencia: son funciones
TypeScript con nombres de las operaciones existentes. `app.ts` proporciona las
funciones SQLite; `db/consultorio-postgres.ts`, las PostgreSQL. Las diferencias
de SQL y transacciones quedan explícitas en cada motor.

`reglas-api.ts` reúne los validadores que antes estaban dentro de `app.ts`,
la comprobación de fecha de creación inmutable, los límites económicos,
la realización manual y la etiqueta de próxima sesión. Se reutilizan
`validar-paciente.ts`, `calendario.ts`, `models.ts` y la autenticación de la etapa 3A.
No se modificaron los modelos ni servicios Angular, los métodos de autenticación,
el secreto JWT local ni la migración 001. No se añadieron dependencias ni tablas.

Durante la etapa 3B `server.ts` importaba `crearApp` y abría SQLite. Los comandos
`dev` y `start` todavía no llamaban a `crearAppPostgres`; esto cambió en la etapa 3C.
Durante una solicitud de prueba PostgreSQL, autenticación y negocio consultan
exclusivamente el mismo pool PostgreSQL; nunca se cruzan IDs entre motores.

### Operaciones adaptadas

| Grupo | Comportamiento preservado |
| --- | --- |
| Pacientes | Listar, sugerir código, consultar, crear, crear con reserva, editar y renombrar. Fecha de creación asignada e inmutable; opcionales `null`. |
| Códigos | Únicos por profesional sin distinguir mayúsculas; sugerir no reserva. El alta automática se recalcula bajo bloqueo. |
| Agenda | Siete días, semana de Buenos Aires, navegación por fecha y estados Disponible/Programado/Liberado. Una consulta obtiene todos los turnos semanales. |
| Horarios | Alta futura, consulta individual con sesión asociada y disponibilidad futura de la semana elegida. |
| Sesiones | Reservar, consultar, confirmar manualmente, editar y reprogramar; sincronizar ambos turnos y la próxima sesión de los pacientes afectados. |
| Histórico | Solo Realizada; semana determinada por la fecha de la sesión. No se realiza automáticamente por el paso del tiempo. |
| Honorarios y cobros | Enteros en centavos, mismos límites, total cobrado acumulado y saldo calculado. Pendientes solo de realizadas con saldo. |
| Dashboard | Activos sin distinguir mayúsculas, realizadas de esta semana, realizadas con saldo de cualquier fecha y horarios libres futuros de esta semana. |

### Consultas y contratos JSON

Las consultas independientes usan `await pool.query(sql, valores)`; las consultas
de una transacción usan `await cliente.query(sql, valores)`. `$1`, `$2`, etc.
reemplazan `?` y parámetros con nombre de SQLite. Los valores del usuario jamás
se concatenan al SQL. Los fragmentos compartidos de columnas son constantes.
`INSERT ... RETURNING id` reemplaza `lastInsertRowid` y `rowCount` reemplaza
`changes` para comprobar asignaciones efectivas.

Las rutas esperan todas las operaciones auxiliares, incluidas búsqueda de ficha,
reserva y próxima sesión. `await` no confirma una transacción: la función de
escritura devuelve su resultado después de esperar el `COMMIT` real. SQLite
conserva funciones síncronas dentro de `db.transaction(...).immediate(...)`;
no se introducen promesas dentro de sus transacciones.

Los nombres camelCase se escriben entre comillas. Las proyecciones `to_char`
conservan fechas y horas, también valores `null`. La creación de cuenta sigue
usando `toISOString()` sobre `TIMESTAMPTZ`. IDs, centavos, diferencias de centavos
y `COUNT(*)::integer` son números JSON. No se modifican parsers globales de `pg`.
La comparación temporal usa `fecha + horario > $n::timestamp` con el instante
local calculado por `calendario.ts`; no depende de la zona horaria del proceso.

### Transacciones, concurrencia y aislamiento

Todas las escrituras de negocio siguen estos pasos:

1. Obtener un cliente del pool y ejecutar `BEGIN`.
2. Establecer `lock_timeout = '3s'` e `idle_in_transaction_session_timeout = '10s'` mediante `SET LOCAL`.
3. Ejecutar `SELECT id FROM public.usuarios WHERE id = $1 FOR UPDATE` usando el propietario del JWT.
4. Leer, validar y guardar mediante ese mismo cliente.
5. Esperar `COMMIT`; ante error, intentar `ROLLBACK`.
6. Liberar el cliente en `finally`; descartarlo si perdió la conexión o no pudo revertirse.

El bloqueo coordina las escrituras de una misma cuenta. Una segunda reserva
espera a la primera y vuelve a consultar el estado confirmado; recibe 409 si el
horario quedó ocupado. Un alta automática vuelve a buscar código después de
tomar el bloqueo. Las cuentas distintas bloquean filas diferentes y pueden
escribir de forma independiente. Las lecturas normales siguen viendo datos
confirmados. Ver [bloqueos de filas](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)
y [transacciones con pg](https://node-postgres.com/features/transactions).

No se mantiene una conexión prestada mientras se calcula Argon2id. El pool
mantiene sus límites previos: cinco conexiones, cinco segundos de espera de
conexión y diez segundos por consulta. Los límites locales de transacción se
restauran al terminar; no son cambios de configuración del servidor.
Ver [límites de espera de PostgreSQL](https://www.postgresql.org/docs/18/runtime-config-client.html).

Al renombrar se difieren solo `turnos_paciente_fk` y `sesiones_paciente_fk`.
Paciente, turnos y sesiones se actualizan filtrando `usuarioId`; PostgreSQL
verifica las relaciones al confirmar. Alta con reserva y reprogramación también
son atómicas. `UNIQUE` y FK compuestas siguen siendo garantías adicionales.

Todas las consultas privadas, uniones, sugerencias y escrituras utilizan el ID
de `res.locals.usuarioId`. Los cuerpos con `usuarioId` extra se rechazan, y un
recurso ajeno recibe el mismo 404 que uno inexistente. La base impide referencias
cruzadas mediante claves compuestas, aunque dos cuentas compartan código u horario.
No se incorporaron RLS ni nuevas formas de autenticación.

Los cuatro indicadores del Dashboard se obtienen mediante subconsultas en una
sola sentencia SELECT. Comparten la instantánea de esa sentencia; no se mezclan
cantidades leídas antes y después de un guardado concurrente. La prueba detiene
un alta con reserva antes del COMMIT y comprueba los indicadores anteriores;
después de confirmar comprueba los nuevos.

### Errores y recuperación

Se conservan 200, 201, 400, 401, 404, 409, 413 y 500, con los mensajes existentes.
`23505` se traduce a 409 únicamente para las restricciones conocidas de código
y horario; la autenticación conserva su tratamiento de email duplicado.
Otros errores SQL inesperados reciben 500 genérico, sin consultas internas.

Las pérdidas de conexión y los límites de disponibilidad reciben 503.
`55P03` (espera de bloqueo agotada) y `40P01` (deadlock) se reconocen por SQLSTATE;
la transacción se revierte antes de responder. El negocio usa el mensaje fijo
«El servicio no está disponible. Intentá nuevamente.»; la autenticación conserva
su mensaje 503 de la etapa 3A. Un token inválido sigue recibiendo 401.

Además del listener de conexiones ociosas, el cliente prestado escucha errores
de socket durante la transacción. Una conexión rota se descarta y el pool puede
reemplazarla. No se imprime el error SQL original ni información clínica.
No hay reintentos automáticos de escrituras. Si se pierde la respuesta de un
COMMIT por una caída de red, el cliente podría desconocer si se confirmó: debe
consultar el estado antes de repetir una operación. Las pruebas cubren un COMMIT
rechazado y una interrupción antes de confirmar; no afirman eliminar esa ambigüedad.

### Pruebas, equivalencia y datos de desarrollo

```powershell
# Desde backend, exclusivamente con TEST_DATABASE_URL.
npm.cmd run test:postgres:api
npm.cmd run test:postgres
# Suite habitual y compilación frontend:
npm.cmd test
Set-Location ..
npm.cmd run build
```

`api-fixtures.mjs` crea dos profesionales ficticios con registro/login reales,
un secreto JWT efímero y un reloj controlado. `contrato-api.mjs` ejecuta el mismo
recorrido con SQLite en memoria y PostgreSQL en `psique_test`. `api.test.mjs`
compara las respuestas y agrega concurrencia, persistencia, rollback y fallos.
La única normalización de la transcripción de negocio es la correspondencia de
IDs de sesiones; no se omiten campos, estados HTTP ni mensajes para forzar igualdad.
Registro/login/JWT tienen además las 19 pruebas previas de autenticación.

Los datos PostgreSQL llevan un prefijo de email con UUID propio de la instancia.
La limpieza abre una conexión que verifica base, rol y propietario `psique_test`,
obtiene solamente esos IDs y elimina sesiones, turnos, pacientes y usuarios en
una transacción. No vacía tablas completas ni modifica desarrollo. Las cantidades
iniciales y finales de las cuatro tablas deben coincidir.

Los fallos SQL intermedios se provocan en conexiones exclusivas de prueba,
después de ejecutar escrituras reales. También se interrumpe una conexión activa
propia de `psique_test` para comprobar la reversión del servidor y su recuperación.
No se detiene PostgreSQL, no se tocan conexiones de desarrollo ni se agregan triggers
o restricciones de prueba permanentes.

Verificación ejecutada el **14/10/2026**:

- **100 resultados aprobados** en `test:postgres`: los 42 anteriores y 58 nuevos; incluye cuatro contenedores y el recorrido comparativo SQLite temporal.
- **74 resultados aprobados** en la suite SQLite existente, sin modificar sus archivos de pruebas.
- **186 respuestas HTTP de negocio por motor comparadas**, con mismos estados, mensajes y JSON tras corresponder IDs.
- Backend y frontend compilados correctamente; frontend sin advertencias.
- Reservas, altas automáticas y reprogramaciones simultáneas comprobadas; un ganador cuando corresponde.
- Independencia de B con A bloqueado; espera máxima controlada de A y recuperación posterior.
- Rollback de alta con reserva, renombrado y reprogramación, rechazo por FK al confirmar y respuesta posterior al COMMIT comprobados.
- Persistencia después de cerrar y reabrir el pool; fechas cercanas a medianoche, cambio de semana/año y tratamiento entre años 0001 y 9999.
- Errores 500/503 sin detalles internos, saturación, conexión interrumpida y recuperación del pool comprobados.
- Roles y permisos verificados; `psique` permanece con cero usuarios, pacientes, turnos y sesiones.
- `psique_test` sin registros ficticios permanentes al finalizar las pruebas.
- Frontend, autenticación, bases SQLite, tres respaldos, migración 001 y `.env` conservados, comprobados mediante hashes.
- Hashes de **77 archivos protegidos** sin diferencias; revisión de **32 archivos** de fuente/configuración/documentación sin coincidencias con las contraseñas PostgreSQL reales ni el secreto JWT actual.

### Diferencias encontradas y soluciones

| Diferencia | Solución aplicada |
| --- | --- |
| SQLite síncrono / PostgreSQL asíncrono | Rutas compartidas esperan las operaciones; SQLite conserva transacciones síncronas y PostgreSQL usa un cliente por transacción. |
| `?`, parámetros con nombre y `lastInsertRowid` | `$n`, arreglos de valores, `RETURNING id` y `rowCount`. |
| Fechas texto / tipos DATE y TIME | Proyección SQL a los formatos anteriores, sin conversión por zona horaria. |
| COUNT como int8 textual | Conversión SQL a INTEGER para conservar números JSON. |
| Escrituras SQLite serializadas / concurrencia PostgreSQL | Bloqueo del profesional al iniciar cada escritura, con espera limitada. |
| Renombrado de claves | Dos FK diferibles verificadas al COMMIT; todas las referencias se actualizan en la misma transacción. |
| IDs de 32 bits y secuencias con huecos | IDs de consulta fuera de rango reciben 404; las pruebas relacionan IDs sin exigir numeraciones iguales. |
| Fallos de conexiones prestadas | Listener de socket durante la transacción, rollback y descarte del cliente roto. |

La primera comparación detectó una expectativa de prueba desactualizada: la ficha
de B ya tenía próxima sesión después de su reserva. Ambos motores devolvían
correctamente ese dato; se corrigió la expectativa. La prueba de interrupción
real detectó el manejo faltante de errores de socket en clientes prestados;
se corrigió y la prueba pasó. No quedaron diferencias funcionales en el recorrido
comparado ni se modificaron pantallas para adaptarlas a PostgreSQL.

### Conceptos para la defensa de la etapa 3B

| Concepto | Explicación breve |
| --- | --- |
| `async` / `await` | Una función asíncrona devuelve una promesa. `await` espera el resultado antes de continuar sin bloquear toda la API. |
| Pool | Reutiliza conexiones limitadas; una transacción toma una hasta terminar. |
| `BEGIN` | Inicia el conjunto de cambios que deberán confirmarse juntos. |
| `COMMIT` | Confirma ese conjunto; recién entonces se responde éxito. |
| `ROLLBACK` | Deshace los cambios pendientes si falla una parte. |
| `SELECT FOR UPDATE` | Bloquea la fila del profesional para coordinar sus escrituras concurrentes. |
| Unicidad | Impide duplicar un código u horario dentro de la misma cuenta. |
| Integridad referencial | Exige que pacientes y turnos referenciados existan y pertenezcan al mismo profesional. |
| Concurrencia | Varias solicitudes avanzan a la vez; los bloqueos evitan decisiones incompatibles. |
| Aislamiento de datos | JWT identifica al profesional y cada consulta limita el alcance mediante `usuarioId`. |
| Adaptación SQL | Cambia la comunicación con el motor manteniendo los mismos contratos HTTP y reglas. |

La activación, pendiente al finalizar la etapa 3B, se aborda en el apartado
siguiente. Se mantiene la decisión de comenzar vacío, sin importador ni mezcla de motores.

## Etapa 3C: PostgreSQL como base habitual

### Arranque y cierre

`server.ts` utiliza exclusivamente `iniciarServidorPostgres`, `abrirPoolPostgres`
y `crearAppPostgres`. No importa `app.ts` ni `db/database.ts`.
`DB_PATH` ya no se lee, incluso si permanece en una configuración local anterior.

El arranque valida primero `JWT_SECRET` y `PORT`; después exige `DATABASE_URL`
para `psique_app`/`psique`. El pool verifica el destino y la ausencia de privilegios
administrativos. Ejecuta cuatro SELECT con LIMIT 0 que comprueban acceso y todas
las columnas esperadas sin leer registros. Recién entonces monta la API completa
y escucha en `127.0.0.1:3000`. No ejecuta DDL, migraciones ni carga de ejemplos.
El historial técnico continúa inaccesible para el rol de aplicación; se comprueba
con el comando independiente `db:status` del migrador.

Si faltan configuración, conexión o esquema, no abre HTTP. Si el puerto está
ocupado, cierra el pool creado. La consola informa un mensaje propio, sin errores
SQL originales, cadenas de conexión, hashes ni tokens. No existe un retorno a SQLite.

SIGINT y SIGTERM inician el cierre: HTTP deja de aceptar solicitudes, espera las
que están en curso y luego se ejecuta `pool.end()`. La función de cierre se puede
invocar varias veces sin duplicar cierres. Se conserva la escucha solo local.
Ver [cierre HTTP de Node](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback).

`iniciarServidorPostgres` se exporta para probar el mismo ciclo de vida. Solo un
importador de pruebas puede solicitar explícitamente `pruebas: true`, que exige
el rol y base `psique_test`. La entrada habitual de `dev` y `start` no selecciona
pruebas mediante variables o argumentos; siempre requiere `psique_app`/`psique`.
Importar el módulo no abre HTTP automáticamente ni crea un segundo servidor permanente.

### Comandos y credenciales

En esta computadora el lanzador privado incorpora `dev` e `iniciar`. Para ambos
descifra solamente la contraseña de `psique_app`, construye la conexión a
`127.0.0.1:5432/psique` y define `DATABASE_URL` únicamente durante el proceso hijo.
Retira las variables del migrador y de pruebas, y restaura el entorno al terminar.
Node carga el `JWT_SECRET` actual desde `.env`; ese archivo y secreto no se modificaron.
No se persistió la conexión en archivos versionados ni en el código.

```powershell
# Terminal 1, backend; el lanzador se ubica en la carpeta correcta.
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea dev
# Para ejecutar la compilación, desde backend:
npm.cmd run build
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea iniciar
# Terminal 2, raíz de APP-PSIQUE:
npm.cmd start
```

`dev` ejecuta el mismo `npm.cmd run dev` anterior; `iniciar` ejecuta `npm.cmd start`.
Si `DATABASE_URL` ya está suministrada de forma privada en otro entorno, esos
comandos npm pueden utilizarse directamente. No hace falta instalar otra dependencia.
El frontend conserva `http://127.0.0.1:3000/api` y no cambia sus archivos.

### Verificaciones de servidor y persistencia

Primero se ejecutaron las suites anteriores (100 resultados PostgreSQL y 74
SQLite), compilaciones de backend/frontend, estado de migraciones y permisos.
Después se agregó `test-postgres/servidor.test.mjs`, con ocho pruebas:

- JWT inválido y puerto inválido impiden abrir el pool.
- Falta de `DATABASE_URL`: la entrada normal sale con error y no crea SQLite.
- La entrada normal rechaza una conexión del rol/base de pruebas.
- Un fallo de esquema simulado cierra el pool sin abrir HTTP ni ejecutar DDL.
- Un puerto ocupado cierra las conexiones creadas durante el arranque fallido.
- Cierre HTTP/pool idempotente y sin conexiones restantes.
- Cuenta, paciente, horario y sesión persisten tras cerrar y reiniciar Express.
- Una conexión PostgreSQL nueva comprueba IDs y relaciones después del reinicio.

Los ocho casos se ejecutaron correctamente; algunos reúnen varias verificaciones
de esa lista. La suite completa pasó con **108 resultados** (incluye los cuatro
contenedores del recorrido comparativo). Los registros nuevos se crearon
exclusivamente en `psique_test` y se eliminaron por el UUID propio del caso.
No se modificó el esquema para simular el fallo: se interceptó esa consulta en
el proceso exclusivo de prueba. Las migraciones aplicadas se conservaron.

También se iniciaron los comandos habituales `npm start` y `npm run dev` mediante
el lanzador. La comprobación leyó `pg_stat_activity`: la API utiliza `psique_app`
en `psique` con `application_name = 'psique-api'`. El proceso que escucha en 3000
mantiene una conexión TCP a `127.0.0.1:5432`. Las solicitudes sin JWT y el login
inexistente respondieron 401. Desarrollo mantuvo cero registros en las cuatro tablas.

El pool puede cerrar todas sus conexiones después de 30 segundos ocioso y abrir
otra ante la siguiente consulta. Por eso la verificación de conexiones realiza
primero una solicitud que consulte PostgreSQL; la ausencia de un socket ocioso
no significa que Express haya cambiado de motor.

La revisión final comprobó 89 archivos protegidos: 87 permanecen idénticos y dos
solo actualizaron comentarios históricos (`auth.ts` y `app-postgres.ts`). No
cambiaron la autenticación, frontend, bases SQLite, tres respaldos, migración 001
ni `.env`. La revisión de 34 archivos de fuente/configuración/documentación no
encontró coincidencias con las tres contraseñas PostgreSQL reales ni el secreto JWT.

### Integración con Angular

Verificación completada el **15/10/2026** con el frontend real iniciado mediante
`npm start` en `http://127.0.0.1:4200`, desde el navegador integrado de Codex.
Se detuvo temporalmente la API habitual y se utilizó una instancia explícita
de `iniciarServidorPostgres({ pruebas: true })` en el mismo puerto 3000,
conectada únicamente a `psique_test` y con un secreto JWT efímero. No se cambió
la configuración ni ningún archivo del frontend.

Se comprobaron los siguientes recorridos desde las pantallas:

- Registro de dos profesionales ficticios, rechazo de email duplicado y de contraseña incorrecta, y login válido.
- Una ruta privada sin sesión vuelve a Login; lo mismo ocurre después del logout.
- Alta y edición de un paciente con frecuencia Quincenal; fecha de creación de solo lectura.
- Alta de un horario futuro, selección desde el modal de Inicio y reserva de una sesión con paciente, modalidad y honorarios.
- Edición completa de la sesión: fecha pasada, estado Realizada y cobro parcial; honorarios ARS 25.000, cobrado ARS 10.000 y saldo ARS 15.000.
- Dashboard actualizado, modal de pendientes con el saldo correcto y navegación desde ese pendiente al detalle.
- Histórico de la semana actual con la sesión y consulta de la semana anterior vacía.
- Reinicio de Express y recarga del navegador: paciente, sesión, fecha y cobro conservados. Una conexión SQL nueva verificó las relaciones usuario/paciente/turno/sesión y los importes en centavos.
- La cuenta B mostró pacientes, agenda e indicadores vacíos. Las URLs de la ficha y sesión de A devolvieron los estados de recurso no encontrado, sin mostrar datos ajenos.
- Logout retiró las pantallas privadas; la cuenta siguiente consultó sus propios datos.

Se inspeccionaron escritorio de 1280 × 800 y tamaños de 360 × 800 y 320 × 800.
Login, Dashboard, Agenda, detalle de sesión y modal de cobros se revisaron en
los tamaños correspondientes; las vistas pequeñas comprobadas no presentaron
desbordamiento horizontal. La consola del navegador no registró errores ni
advertencias. Esto verifica el navegador de escritorio con tamaños reducidos;
no equivale a una prueba en un celular físico ni a una distribución instalable.
Los mensajes de error de acceso, duplicados y recursos ajenos se comprobaron
desde Angular; los fallos SQL y respuestas 503 permanecen cubiertos por la suite
automatizada, sin detener el servicio PostgreSQL de desarrollo.

Al finalizar se cerró la instancia aislada y se eliminaron exclusivamente los
registros de sus dos cuentas, identificadas por un prefijo UUID, en `psique_test`.
Se restauró el backend habitual con el lanzador privado `-Tarea dev`. Una nueva
comprobación de `pg_stat_activity` confirmó `psique_app`/`psique` y
`application_name = 'psique-api'`; ambas bases quedaron con cero usuarios,
pacientes, turnos y sesiones. Se retiró la sobreescritura temporal del tamaño
del navegador y se dejó Login abierto contra el servidor habitual.

El entorno restringido de ejecución impidió detener el proceso anterior y
crear el proceso hijo del modo `--watch` (`EPERM`). Se ejecutaron esas acciones
específicas con el permiso local correspondiente; no fue necesario modificar
la aplicación, PostgreSQL ni la configuración de Angular.

### Recuperar el arranque SQLite anterior

No hay fallback automático. Para una recuperación deliberada en esta computadora:

1. Detener Express y conservar PostgreSQL y sus datos.
2. Guardar una copia del `backend/src/server.ts` PostgreSQL actual.
3. Restaurar en esa ruta la copia privada `PSIQUE/postgresql-local/server-antes-etapa3c.ts` ubicada dentro de `%LOCALAPPDATA%`.
4. Comprobar el `DB_PATH` del archivo SQLite conservado y el `JWT_SECRET` local; compilar backend y ejecutar el servidor anterior.
5. Verificar sus datos antes de continuar trabajando. Para regresar a PostgreSQL, restaurar el servidor guardado y su conexión privada.

En otra computadora debe recuperarse el servidor de la versión anterior desde
el control de versiones o un respaldo explícito. No se deben borrar ni reinicializar
las bases para cambiar de motor. **Los datos nuevos de PostgreSQL no aparecen
automáticamente en SQLite**; no se implementó importación, sincronización ni doble escritura.

### Conceptos para la defensa

| Concepto | Explicación aplicada |
| --- | --- |
| Motivo de la migración | SQLite guarda un archivo local; PostgreSQL es un servidor adecuado para concurrencia multiusuario y un futuro backend remoto. |
| Pool | Mantiene un límite de conexiones y las reutiliza; no abre una conexión nueva por cada solicitud. |
| Inicio de Express | Valida secretos, espera PostgreSQL y su esquema y luego abre HTTP. |
| Comprobar primero | Evita presentar una API aparentemente disponible cuando no puede acceder a sus datos. |
| Persistencia | Los datos confirmados permanecen en PostgreSQL después de reiniciar Node; no dependen de variables en memoria. |
| Caída de PostgreSQL | El arranque falla o las operaciones reciben 503; no se consulta SQLite como reemplazo. |
| Desarrollo/pruebas | `psique_app`/`psique` y `psique_test`/`psique_test` tienen credenciales y permisos separados. |
| `usuarioId` | Se obtiene del JWT y filtra cada operación; las relaciones compuestas impiden asociaciones entre cuentas. |

Se mantiene la ejecución local, sin despliegue ni TLS remoto. El logout continúa
siendo local y los JWT vencen en una hora. No se añadieron nuevas funciones de
autenticación ni entidades clínicas. Una pérdida de respuesta de COMMIT conserva
la ambigüedad de red documentada en la etapa 3B; no hay reintentos automáticos de escrituras.

