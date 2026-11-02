# PSIQUE — Hosting gratuito: preparación H1

Revisión local finalizada el **02/11/2026**. Proveedores provisionales: Render
Static Free, Render Web Free, Neon Free y Resend Free. No se crearon recursos
remotos, no se publicaron servicios y no se modificaron las reglas de la app.

**Resultado:** la instalación y las compilaciones son reproducibles en Windows;
las suites actuales pasan y la revisión no encontró secretos locales en los
archivos candidatos. Es posible preparar un commit de esta revisión. Todavía
no se recomienda publicar Express: hay avisos de dependencias que requieren
revisión y corrección autorizada. Linux y la integración remota siguen pendientes.

## Git y propuesta de commit

| Dato | Estado comprobado |
| --- | --- |
| Rama | `main` |
| HEAD de partida | `76741c8f7da7490164b026935716fee1a3d5e2c1` |
| Remoto origin | `https://github.com/fjcaudeli/APP-PSIQUE.git` |
| Estado inicial | Limpio; sin archivos nuevos, modificados ni cambios preparados en el índice. |
| Archivos rastreados | 308; 87 pertenecen a la entrega académica ya ignorada. |
| Operaciones Git | Solo lectura. Sin add, commit, push, actualización del índice ni consulta del estado remoto actual. |

Propuesta exacta del siguiente commit de preparación, respecto de ese HEAD:

1. `.gitignore`: exclusiones adicionales de credenciales y respaldos.
2. `README.md`: enlace a este informe y decisión vigente sobre health checks.
3. `backend/POSTGRESQL.md`: misma decisión sobre health checks.
4. `backend/produccion.env.example`: referencias vacías para correo y origen Android.
5. `HOSTING-H1.md`: este informe y las tablas de configuración futura.

Además, se recomienda retirar **del índice, conservando los archivos locales**,
los 87 archivos que devuelve `git ls-files entrega_academica`. Esto es una
propuesta: no se ejecutó. Agregar una carpeta a `.gitignore` no retira archivos
ya rastreados, ni borra sus versiones anteriores del historial. No se propone
reescribir ese historial.

El código actual ya está versionado en el HEAD indicado: no hay que volver a
agregarlo como si fueran archivos nuevos. Título propuesto del commit:
`docs: preparar revisión H1 para hosting gratuito`.

### Clasificación de archivos existentes

| Grupo | Archivos que corresponden |
| --- | --- |
| A — Aplicación y verificación | `src/**`, `scripts/**`, `test-config/**`, configuraciones Angular/Ionic/TypeScript, ambos `package.json` y `package-lock.json`; `backend/src/**`, `backend/scripts/**`, `backend/migrations/**`, `backend/test/**`, `backend/test-postgres/**`, `backend/tsconfig.json` y ejemplos de entorno sin secretos. Conservar también código y pruebas SQLite históricos. |
| B — Reconstrucción Android | `capacitor.config.ts`; los 55 archivos actualmente rastreados en `android/`: Gradle, wrapper JAR/scripts, manifiesto, actividad Java, recursos, políticas de red y pruebas de plantilla. Capacitor vuelve a generar los assets y la integración de plugins durante sync. |
| C — Documentación técnica | `README.md`, `ANDROID.md`, `backend/POSTGRESQL.md` y este informe. `Documento_Funcional_PSIQUE.pdf` es un antecedente anterior a los informes actuales: no usarlo como descripción vigente. |
| D — Excluir | Dependencias, `www`, `dist`, `.angular`, `out-tsc`, bases y respaldos, `.env` privados, DPAPI, claves y keystores, `artifacts`, APK/AAB, build/caché Gradle, `.idea`, `local.properties`, SDK/JDK y assets copiados por Capacitor. Entrega académica: mantener aparte, según la exclusión ya elegida. |

Los 221 archivos rastreados fuera de `entrega_academica/` formaron la copia de
verificación. Se copiaron desde el árbol de trabajo a un directorio descartable
fuera del proyecto, sin `.env`, DPAPI ni `node_modules`. No se tocó la instalación
habitual. Los paquetes de ambos lockfiles proceden del registro público npm.

## Secretos y conservación

Se inspeccionaron los 308 archivos rastreados, incluidos texto extraído de los
cuatro PDF. Se compararon en memoria las tres contraseñas PostgreSQL locales,
el secreto JWT y la clave Resend, sin mostrarlos ni guardarlos en los informes.
No hubo coincidencias. Tampoco se encontraron archivos privados de entorno,
claves privadas o bases locales entre los candidatos. Las tres URLs con
contraseña detectadas pertenecen a pruebas y utilizan valores ficticios.

El bundle de producción aislado contiene la URL reservada de compilación y no
contiene `http://127.0.0.1:3000/api` ni coincidencias con esos secretos. Las variables
de compilación Angular son públicas: solo deben contener la URL de la API.

Esta revisión cubre los archivos actuales; no es una auditoría completa de todo
el historial Git ni una certificación general de seguridad. Las capturas de la
entrega corresponden al recorrido previo con cuentas ficticias, no a una nueva
extracción de datos del consultorio.

Se compararon antes/después 29 archivos protegidos, incluidos APK, `.env`, bases
SQLite, respaldos y archivos DPAPI. También se compararon cantidades y huellas
de todas las filas de las cuatro tablas de `psique` y de los registros previos
de `psique_test`, sin imprimir su contenido. Se conservaron. Las secuencias de
pruebas pueden avanzar por las altas ficticias; no representan datos perdidos.

## Comprobaciones ejecutadas

Entorno: **Windows x64, Node 24.14.1, npm 11.11.0**. Se usaron las dependencias de
la copia aislada, instaladas desde cero con ambos lockfiles.

| Verificación | Resultado |
| --- | --- |
| `npm ci --include=dev --no-audit --no-fund`, raíz | Correcto: 484 paquetes instalados. |
| Mismo comando, `backend` | Correcto: 116 paquetes instalados, incluidos módulos nativos. |
| `npm run build`, raíz | Angular local correcto; salida `www/browser`. |
| `npm run build:production` | Correcto con `PSIQUE_API_URL=https://api.example.test/api`; 54 archivos bajo browser. No se consultó esa dirección. |
| `npm run build`, backend | TypeScript correcto; también se ejecuta antes de ambas suites backend. |
| `npm run test:config` | 37 aprobados; cero fallos, cancelados u omitidos. |
| `npm test`, backend | 87 aprobados; cero fallos, cancelados u omitidos. SQLite usa archivos temporales. |
| `npm run test:postgres` | 108 aprobados; cero fallos, cancelados u omitidos. Únicamente `psique_test` local, con correo ficticio inyectado. |
| `db:status` / `db:status:test` | Ocho migraciones aplicadas, sin pendientes ni aplicaciones nuevas. |
| Android | Configuración y exclusiones revisadas; firma v2 del APK local verificada nuevamente. No se recompiló, sincronizó ni reinstaló. |

En esta PC, el lanzador privado permite repetir la suite en otra copia mediante
`-Tarea probar -Proyecto RUTA_DE_LA_COPIA`. No se copia el lanzador ni sus
credenciales al repositorio. En otro equipo se suministra solamente
`TEST_DATABASE_URL` local, sin variables de conexión de desarrollo.

La suite verifica configuración HTTP, CORS, JWT, aislamiento, conflictos,
transacciones, fallos SQL, TLS inválido, persistencia y arranque/cierre. Las pruebas
de producción con SQL simulado no equivalen a una conexión real con Render/Neon.
No se hizo una nueva revisión visual ni se enviaron correos en H1.

### Dependencias: pendiente antes de exponer servicios

También se ejecutó `npm audit --json` en ambas instalaciones aisladas:

| Proyecto | Moderados | Altos | Críticos | Total de paquetes informados |
| --- | ---: | ---: | ---: | ---: |
| Frontend, incluyendo herramientas | 22 | 9 | 3 | 34 |
| Backend | 1 | 1 | 0 | 2 |

Son conteos de paquetes del informe npm, que incluye dependencias indirectas;
no son 36 vulnerabilidades independientes ni prueban explotación de PSIQUE.
Los tres paquetes clasificados críticos por npm en la raíz son `@angular/build`,
`piscina` y `proxy-addr`, todos marcados como herramientas de desarrollo en su
lockfile. No forman un servidor Angular en el Static Site. `@angular/router`
también está señalado por avisos de SSR; este proyecto compila una SPA sin SSR.
Eso no sustituye revisar y actualizar las dependencias afectadas.

El backend incluye **body-parser 2.3.0**, dependencia de Express afectada por
[un aviso de denegación de servicio con cuerpos comprimidos](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828),
y **qs 6.16.0**, con [otro aviso de denegación de servicio](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
El parseo JSON está activo antes de las rutas; no se debe asumir que JWT elimina
el riesgo del primer aviso. No se ejecutaron ataques para comprobarlo.

No se ejecutaron `audit fix`, actualizaciones, overrides ni cambios de middleware.
Se recomienda una corrección acotada y nueva verificación, autorizada por separado,
antes de conectar una API pública. Los lockfiles de H1 permanecieron intactos.

## Render Static Free — configuración futura

| Campo | Valor propuesto; todavía no configurado |
| --- | --- |
| Tipo | Static Site Free, mismo repositorio. |
| Root Directory | Vacío: raíz del repositorio. |
| Node | `NODE_VERSION=24.14.1`, para reproducir esta verificación. Revisar parches de seguridad antes del despliegue. |
| Build Command | `npm ci --include=dev && npm run build:production` |
| Publish Directory | `www/browser` |
| `PSIQUE_API_URL` | URL HTTPS real de Express terminada en `/api`, pendiente. Pública; sin credenciales. |
| SPA | Source `/*`, Destination `/index.html`, Action **Rewrite**. |
| Secretos | Ninguno de PostgreSQL/JWT/Resend en este servicio. |

El build explícito usa el entorno production; `npm run build` solo genera la
versión local. Se conserva el interceptor Bearer y la validación que rechaza
loopback, HTTP, credenciales, parámetros y fragmentos en producción. La reescritura
SPA permitirá abrir/recargar rutas como `/pacientes` sin un 404 del hosting.
Ver [Static Sites](https://render.com/docs/static-sites) y
[rewrites](https://render.com/docs/redirects-rewrites).

## Render Web Free — configuración futura

| Campo | Valor propuesto; todavía no configurado |
| --- | --- |
| Tipo / runtime | Web Service Free / Node nativo; sin Docker. |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | **`/health/live`** |
| Node | `NODE_VERSION=24.14.1`; no depender del valor predeterminado del proveedor. |
| Entorno | `NODE_ENV=production`; `HOST=0.0.0.0` explícito o predeterminado por producción. |
| Puerto | `PORT` suministrado por Render; no fijar 3000 ni ejecutar el servidor de desarrollo. |
| `FRONTEND_ORIGIN` | Origen HTTPS real del Static Site, sin `/api`, ruta ni barra final. |
| `DATABASE_URL` privada | Conexión directa de `psique_app` a `psique` en Neon. Sin parámetros en la URL. |
| `DATABASE_SSL_MODE` | `verify-full`, obligatorio en producción. |
| `DATABASE_SSL_CA_FILE` | Solo si se necesita una CA pública confiable adicional. No usar certificados sin verificar. |
| `JWT_SECRET` privado | Secreto robusto propio del entorno remoto; se suministrará por canal privado en la etapa autorizada. |
| Correo privado | `CORREO_PROVEEDOR=resend`, `CORREO_REMITENTE`, `RESEND_API_KEY`; `CORREO_DESTINATARIO_PRUEBA` mientras se use el remitente de prueba. |
| Android opcional | `CAPACITOR_ANDROID_ORIGIN=https://localhost`; conserva el origen web y enlaces de correo. |
| Proxy | `TRUSTED_PROXY_CIDRS`: completar solo con redes verificadas. Vacío conserva la protección contra encabezados falsos, pero agrupa el cupo por IP del proxy. |
| No suministrar a Express | Credenciales administrativas, `MIGRATION_DATABASE_URL`, `APP_DATABASE_URL` ni `TEST_DATABASE_URL`. |

`--include=dev` instala TypeScript aunque el entorno de compilación sea production.
El inicio espera conexión, rol y esquema; luego escucha HTTP. No migra, no abre
SQLite como reemplazo y no necesita permisos DDL. Señales SIGINT/SIGTERM cierran
HTTP, envíos pendientes y pool. Falta comprobar las señales reales en Linux.
Ver [Node](https://render.com/docs/node-version) y
[Web Services](https://render.com/docs/web-services).

`/health/live` no llama a SQL, ni al middleware JWT. `/health/ready` consulta SQL
y conserva su caché y límite de espera: usarlo explícitamente al verificar la
instalación. Elegir live reduce actividad periódica sobre Neon, pero deja de
detectar una caída posterior de PostgreSQL en el control automático; las
operaciones afectadas mantienen 503. El arranque sí comprueba PostgreSQL.

### Linux y módulos nativos

No se encontró un entorno Linux de aplicación preparado: WSL solo informa la
distribución interna de Docker Desktop. No se instaló ni utilizó Docker, WSL
adicional o un nuevo runtime. **No se ejecutó una compilación Linux.**

La revisión no encontró rutas Windows obligatorias en el build/inicio de Express.
Los scripts normales usan Node/TypeScript y `pg` JavaScript. El lanzador DPAPI es
solo local: el hosting suministrará variables por su propio mecanismo.
Los paquetes instalados incluyen binarios Linux x64 de `argon2` y `better-sqlite3`.
La instalación limpia Windows también ejecutó correctamente sus pasos nativos.
No se eliminaron dependencias ni se redujo el costo de Argon2id.

[Render documenta Debian 12 y herramientas C/C++/Python/make](https://render.com/docs/native-runtimes),
por lo que no se identifica ahora un impedimento que obligue a Docker. Esa es
compatibilidad prevista: el primer build Linux debe validar los módulos nativos
con Node y memoria reales del servicio. SQLite sigue instalado por las pruebas
históricas aunque no sea la persistencia de Express.

El wrapper `android/gradlew` está rastreado con modo 100644; si se quisiera usar
el comando Android automatizado en Linux, habría que revisar su permiso ejecutable.
No afecta el build web/backend ni el procedimiento Windows con `gradlew.bat`.
No se cambió el índice para resolverlo dentro de H1.

### Límites gratuitos

Render Free puede suspender Express tras 15 minutos inactivo; el próximo acceso
puede tardar aproximadamente un minuto. Hay 750 horas mensuales compartidas por
workspace, límites de transferencia y compilación y disco efímero. No usar el
disco como persistencia ni agregar pings para mantener servicios despiertos.
Revisar los cupos y condiciones reales antes de crear recursos; un plan gratuito
no garantiza ausencia de límites o cargos por otros conceptos habilitados.
El plan no dispone de shell ni tareas one-off: las migraciones se ejecutarán
separadamente desde una terminal autorizada, con el rol migrador.
Ver [límites oficiales](https://render.com/docs/free).

Render bloquea puertos SMTP habituales en Free. PSIQUE usa la API HTTPS de Resend,
sin SMTP, y conserva la confirmación obligatoria para cuentas nuevas. La memoria
y CPU reducidas y el costo de Argon2id necesitan medirse antes de una demo pública;
no se prometen latencias o concurrencia todavía no verificadas.

## Neon Free — requisitos para la siguiente etapa

| Campo | Requisito |
| --- | --- |
| Motor | PostgreSQL 18; comprobar versión menor y disponibilidad de región al crear el proyecto. |
| Base | `psique`, vacía; no importar desarrollo ni SQLite. |
| Aplicación | `psique_app`: LOGIN sin atributos administrativos, sin pertenecer a `neon_superuser`, sin propiedad de base/esquema ni DDL. |
| Migraciones | `psique_migrador`: propietario de `psique` y objetos, sin atributos administrativos. Credencial fuera de Express. |
| Pruebas | Mantener `psique_test` exclusivamente local. No ejecutar la suite automática contra Neon. |
| Roles | Crearlos mediante SQL con permisos explícitos; los creados por Console/API/CLI reciben membresía administrativa según la documentación de Neon. |
| Conexión | Directa, sin hostname `-pooler`. Mantener pool `pg` de máximo cinco conexiones. |
| TLS | `verify-full`: CA confiable, nombre de host y TLS mínimo 1.2. |
| URI | Prepararla privadamente, sin query string; codificar contraseña correctamente. La URI propuesta por Neon puede traer `sslmode`/`channel_binding`: nuestro validador rechaza parámetros. Mantener la verificación TLS mediante la configuración existente. |
| Migraciones | Ejecutar desde `backend` `npm run db:status`, `npm run db:migrate` y `npm run db:status` en una etapa autorizada, únicamente con `MIGRATION_DATABASE_URL` remota y TLS de producción. Nunca como build/start de Render. |
| Respaldo | Definir después un procedimiento `pg_dump` por conexión directa y probar restauración aislada; no asumir que el historial gratuito reemplaza un backup propio. |

Se inspeccionaron las ocho migraciones actuales: 001 esquema y permisos; 002
resumen; 003 calendario/cancelaciones; 004 completar duración histórica; 005
duraciones 30/40/50/60; 006 inicio derivado del tratamiento; 007 confirmación y
recuperación; 008 excepción de cuentas anteriores. No se editó ninguna. En una
base remota vacía, 008 no crea ni habilita cuentas ficticias; las nuevas siguen
requiriendo confirmación.

Antes de habilitar Express remoto se deberán comprobar base/propietario, atributos
y membresías de roles, CONNECT y permisos de esquema, tablas/secuencias/FK,
restricciones, historial/checksums y ausencia de acceso del rol app al historial
o a DDL/borrados. Mantener SQL parametrizado, claves con `usuarioId`, BEGIN/COMMIT/
ROLLBACK y SELECT FOR UPDATE. El migrador usa un advisory lock de sesión: requiere
conexión directa, que también simplifica conservar sus ajustes de sesión.
Ver [roles](https://neon.com/docs/manage/roles) y
[límites del pooling transaccional](https://neon.com/docs/connect/connection-pooling).

La documentación vigente de Neon Free indica **1 GB por proyecto**, 100 CU-horas
por proyecto/mes, 5 GB de transferencia pública y suspensión tras 5 minutos
inactivo. No reutilizar el límite anterior de 0,5 GB. Habrá que probar el despertar
con la espera actual de cinco segundos del pool y recuperación 503, sin relajar
TLS o reintentar escrituras automáticamente. Elegir regiones cercanas entre API
y base y revisar cupos, backups y continuidad antes de la demo.
Ver [planes actuales](https://neon.com/docs/introduction/plans).

## Resend y Android

Resend Free documenta 3000 correos mensuales y 100 diarios. Sin dominio verificado,
el remitente `onboarding@resend.dev` solo permite el email de la propia cuenta
Resend. Por ahora una demo de correo tendrá ese único destinatario autorizado;
otros usuarios nuevos no podrán completar el flujo con ese remitente. No se
redirigen sus enlaces ni se salta la confirmación. Para destinatarios arbitrarios
hará falta una decisión posterior sobre dominio/remitente, sin comprar ni cambiar
DNS en H1. Ver [restricción](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
y [plan](https://resend.com/pricing).

El APK local permanece en `android/app/build/outputs/apk/debug/app-debug.apk`:
4.459.210 bytes, SHA-256
`946453476033A8342A02FF3185795CCC7870DEC055866779C3288CBC69663ED2`.
Sigue usando API loopback por ADB reverse y necesita esta PC. HTTP solo está
permitido a 127.0.0.1 en debug. No se modificó su contenido.

La futura compilación Android necesitará la URL HTTPS definitiva en
`PSIQUE_API_URL`, los comandos existentes `android:sync`/`android:apk` y el origen
Capacitor permitido expresamente en Express. No contiene credenciales del servidor.
Release conserva su política HTTPS y guardia contra bundles locales. No se generó
APK remoto. Los enlaces de correo siguen abriéndose en la web, sin App Links.
Ver [ANDROID.md](ANDROID.md).

## Entrega académica y cierre

Siguen disponibles los PDF funcional (21 páginas), técnico (30 páginas) y
presentación (15 diapositivas) de `entrega_academica/PSIQUE_2026-11-01`, con sus
fuentes y evidencias. Se comprobaron lectura y conservación; no se regeneraron ni
se cambiaron datos institucionales. Conviene entregar los tres PDF y, si se requiere,
un paquete de fuentes aparte,
manteniendo fuera de Git las capturas, logs, imágenes de revisión y otros artefactos.
Si se decide versionar PDF, elegir expresamente esos tres y ajustar la exclusión;
no agregar por accidente las 87 piezas de la entrega completa.

Pendientes: decidir/corregir avisos npm antes de exponer Express, confirmar el
retiro del índice de la entrega, autorizar el commit y luego la etapa remota.
En ella se verificarán Linux, roles/TLS/latencia Neon, URL/orígenes, proxy, SPA,
cabeceras estáticas, recursos Free, correo y recorrido integrado. Ninguno de esos
servicios se creó en H1. No se cambió funcionalidad, autenticación, migraciones,
datos de desarrollo, credenciales privadas ni el APK.
