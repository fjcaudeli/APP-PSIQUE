# PSIQUE

Aplicación de seguimiento psicoterapéutico y administración de consultorio. Se desarrolla con **Ionic y Angular** en el frontend, **Node.js, Express y TypeScript** en la API, y **SQLite** para la persistencia local.

Esta etapa permite crear y editar pacientes, cargar horarios, agendar sesiones, confirmar que se realizaron y registrar sus honorarios y cobros. Las cuatro tarjetas de Inicio son accesos a estos recorridos y muestran cantidades calculadas a partir de la base de datos.

La interfaz puede usarse en el navegador de una PC y se adapta a pantallas pequeñas. El desarrollo continúa: todavía no incluye autenticación, permisos de usuarios ni despliegue para uso clínico en producción.

## Ejecutar la aplicación

Se necesitan dos terminales, una para cada proceso. El entorno de desarrollo utiliza **Node.js 24.14.1 y npm 11.11.0 en Windows x64**. El backend requiere Node 24.x desde 24.14.1 y utiliza `better-sqlite3` para abrir SQLite; no hace falta instalar un servidor de base de datos separado ni Angular CLI o Ionic globalmente.

### Terminal 1: backend

Desde la raíz de `APP-PSIQUE`:

```powershell
Set-Location .\backend
npm.cmd install
npm.cmd run dev
```

La API queda disponible en **http://127.0.0.1:3000/api**. Al iniciar, crea `backend/data/psique.sqlite` si falta y ejecuta las migraciones pendientes. **Una base nueva comienza vacía**: no se cargan pacientes, horarios, sesiones ni importes de ejemplo automáticamente. Una base de una versión anterior conserva sus registros.

`dev` ejecuta Node con `--watch` y reinicia el backend al cambiar el código. La comprobación completa de tipos se realiza mediante `build`.

### Terminal 2: frontend

Desde la raíz de `APP-PSIQUE`, sin entrar en `backend`:

```powershell
npm.cmd install
npm.cmd start
```

Abrí **http://127.0.0.1:4200**. Ambas terminales deben permanecer activas. `Ctrl+C` detiene el proceso de su terminal. Las instalaciones son necesarias la primera vez o al cambiar dependencias; la raíz y `backend` tienen paquetes y carpetas `node_modules` separados. `npm.cmd` evita las restricciones de ejecución de scripts de PowerShell.

### Compilación y pruebas

Frontend, desde la raíz:

```powershell
npm.cmd run build
```

Genera la aplicación web en `www/browser`; no inicia ni incluye Express o SQLite.

Backend, desde `backend`:

```powershell
npm.cmd run build
npm.cmd start
```

`build` comprueba los tipos y genera `backend/dist`; `start` ejecuta `dist/server.js`. Usá `dev` o `start`, uno por vez para el mismo puerto. Compilar o iniciar el servidor no restaura los datos.

Para ejecutar las pruebas del backend:

```powershell
npm.cmd test
```

El comando compila y ejecuta `test/*.test.mjs` con el ejecutor de Node. Las pruebas usan bases temporales, relojes controlados y datos explícitos de prueba; no necesitan reemplazar la base de desarrollo.

### Configuración local

El backend funciona sin un archivo `.env`. Para personalizar los valores, desde `backend` se puede crear una copia de `.env.example`:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

Hacé la copia solo si todavía no existe un `.env` personalizado. Los comandos de inicio cargan ese archivo opcional con `--env-file-if-exists=.env`.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto de Express. |
| `DB_PATH` | `data/psique.sqlite` | Archivo SQLite; las rutas relativas se resuelven desde `backend`. |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:4200` | Origen del navegador permitido por CORS. |

La API se limita a `127.0.0.1`. Su URL en el frontend está centralizada en `src/app/api.config.ts`. Si cambiás el puerto del backend, actualizá esa constante. `localhost` y `127.0.0.1` son orígenes distintos para el navegador: con la configuración inicial usá las direcciones indicadas arriba.

La base local, sus archivos auxiliares, los archivos `.env`, las dependencias y las compilaciones no se versionan. `.env.example` contiene únicamente valores de ejemplo. La primera instalación requiere descargar dependencias; luego la aplicación puede ejecutarse localmente con ambos procesos.

## Recorridos de la aplicación

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

Se propone un código disponible, por ejemplo `P-001`. La sugerencia no reserva ese código. Puede personalizarse o dejarse vacío para generar uno al guardar. Si otro registro ya lo ocupa, el formulario conserva lo escrito y muestra el conflicto.

**Crear paciente** guarda el alta y abre su ficha. **Cancelar** vuelve al listado sin crear registros. En las tarjetas siguen apareciendo la próxima sesión, cuando existe, y la fecha de creación.

Desde una ficha, **Editar ficha** permite modificar diez datos: código, modalidad, estado, próxima sesión, frecuencia, día habitual, horario habitual, inicio del tratamiento, motivo de consulta y Post-it. **La fecha de creación se muestra como información y no se puede editar**. El servidor la asigna al crear y rechaza los intentos de cambiarla por la API.

Los formularios trabajan sobre un borrador. Guardar envía los datos a la API; Cancelar descarta cambios no enviados. Los errores de validación, duplicados o conexión conservan el borrador. Mientras una solicitud está en curso se bloquean los botones de guardado para evitar duplicarla.

### Agenda y agendamiento

Agenda abre la semana actual y permite recorrer **Anterior**, **Esta semana** y **Siguiente**. Cada día muestra sus horarios. Un día sin registros no significa que tenga horarios ofrecidos: primero se agregan mediante **Agregar horario disponible**, indicando una fecha y hora futuras.

Un horario disponible puede abrirse desde Agenda o desde la tarjeta de Inicio. **Agendar sesión** permite elegir un paciente existente, la modalidad de esa sesión y sus honorarios en ARS. Guardar ocupa el horario y abre el detalle de la sesión creada. No pueden coexistir dos sesiones para la misma fecha y hora.

Si el paciente aún no existe, **Crear paciente** dentro de Agendar sesión conserva la fecha, hora, modalidad e importe elegidos. El formulario muestra ese contexto y su botón pasa a ser **Crear paciente y agendar**. El backend realiza ambas operaciones en una misma transacción: si el horario se ocupó o algún dato no es válido, no queda un paciente creado sin la reserva solicitada. Cancelar vuelve al agendamiento con el contexto conservado.

Al agendar se actualiza la etiqueta de próxima sesión del paciente con su primera sesión programada futura. Cambiar los datos habituales desde la ficha no modifica las fechas, horarios ni modalidades de las sesiones que ya se agendaron. La modalidad habitual del tratamiento y la modalidad de una sesión son datos distintos.

Los horarios ya pasados no pueden reservarse. Los registros antiguos de tipo `Liberado` siguen siendo utilizables si son futuros; todavía no hay un recorrido para cancelar sesiones y liberar nuevos horarios.

### Sesiones realizadas e histórico semanal

Toda sesión agendada comienza como **Programada**. Desde su detalle se puede seleccionar **Marcar como realizada** cuando llegó su horario. Esta acción confirma que efectivamente ocurrió.

Que pase la hora no cambia automáticamente su estado: una sesión que no se confirmó continúa programada y no aparece en el histórico de realizadas ni en pendientes de cobro. El histórico usa la fecha de la sesión, no la fecha en que se presionó el botón. Por ejemplo, confirmar hoy una sesión de la semana anterior no aumenta el contador de la semana actual.

La pantalla **Sesiones de la semana** muestra las realizadas de lunes a domingo de la semana actual. Seleccionar una abre su detalle; desde allí también se puede acceder a la ficha del paciente.

### Honorarios y cobros

El detalle muestra **Honorarios**, **Total cobrado** y **Saldo pendiente**. El formulario permite modificar honorarios y el total acumulado cobrado por esa sesión. No registra una lista separada de movimientos de pago.

Por ejemplo, si los honorarios son ARS 25.000 y ya se recibieron ARS 10.000, el saldo es ARS 15.000. Al recibir los ARS 15.000 restantes, se ingresa **25000** como total cobrado, porque ese campo representa la suma acumulada. Una sesión realizada desaparece de pendientes al quedar sin saldo.

Los importes se presentan en pesos argentinos y se guardan como **centavos enteros** para evitar errores de representación decimal. Se admiten entre 0 y 999.999.999 centavos (ARS 9.999.999,99), con hasta dos decimales en los formularios. Al escribir, se usa coma o punto como separador decimal y se omiten separadores de miles. El total cobrado no puede superar los honorarios. Las sesiones programadas pueden tener importes registrados, pero solo las realizadas con saldo positivo integran los pendientes de cobro.

No se inventan montos ni se generan sesiones por el paso del tiempo. Los honorarios se cargan al reservar o desde el detalle.

## Datos y validaciones

| Campo del paciente | Regla |
| --- | --- |
| `codigo` | Entre 1 y 12 caracteres; comienza con letra ASCII o número y admite luego letras ASCII, números, guion y guion bajo. Único sin distinguir mayúsculas. `nuevo` está reservado, también con otra capitalización. En el alta puede omitirse o estar vacío para generación automática. |
| `modalidad` | `Presencial` o `Virtual`. |
| `estado` y `frecuencia` | Textos obligatorios de hasta 40 caracteres cada uno. |
| `proximaSesion` | `null` o texto de hasta 30 caracteres. Es la etiqueta breve de la tarjeta. |
| `diaHabitual` | `null` o uno de los siete nombres de días en español. |
| `horarioHabitual` | `null` o una hora válida de 24 horas, con formato `HH:mm`. |
| `fechaCreacion` | Fecha `YYYY-MM-DD`, asignada por el servidor y conservada durante las ediciones. |
| `fechaInicioTratamiento` | Fecha de calendario válida `YYYY-MM-DD`, editable. |
| `motivoConsulta` | Texto de hasta 3000 caracteres; puede quedar vacío. |
| `postIt` | Texto de hasta 300 caracteres; puede quedar vacío. |

Usá alias o códigos y evitá nombres reales como identificador. El código aparece en las fichas, listados, agenda y URLs. `PA-01` y `ab_2` cumplen el formato; `Ana Pérez`, `-P001` y `nuevo` no. `PA-01` y `pa-01` no pueden identificar a pacientes diferentes.

El backend valida nuevamente todas las solicitudes: tipos, campos permitidos, longitudes, fechas reales, importes y relaciones entre registros. Recorta espacios externos de los textos, pero no trunca contenido para hacerlo entrar en un límite. Las respuestas de error usan `{ "mensaje": "..." }`.

Cambiar un código actualiza al paciente y sus referencias en horarios y sesiones dentro de una transacción. Si algo falla, SQLite revierte el conjunto. La fecha de creación y los datos de las sesiones se conservan. Las pantallas renuevan sus consultas al entrar para mostrar lo guardado.

## Arquitectura y organización

```text
Pantalla de Ionic + Angular
        ↓ formulario o consulta
Servicio de Angular → HttpClient
        ↓ HTTP: GET / POST / PUT
Express → validación → consultas y transacciones SQLite
        ↓ JSON
Estado del componente / Observable → plantilla
```

El navegador muestra la interfaz; el backend aplica las reglas y es el único proceso de la aplicación que accede al archivo SQLite. Una respuesta correcta confirma un guardado persistido. Los componentes muestran errores de carga o guardado y no reemplazan silenciosamente una API caída con datos de ejemplo.

```text
APP-PSIQUE/
├── src/
│   ├── main.ts                   Inicio de Angular
│   ├── global.scss               Estilos globales e Ionic
│   └── app/
│       ├── app.component.*       Contenedor y navegación inferior
│       ├── app.config.ts         Proveedores y configuración regional
│       ├── app.routes.ts         Rutas con carga de pantallas por demanda
│       ├── api.config.ts         URL base de la API
│       ├── models/               Paciente, turno, sesión y resumen
│       ├── services/             Acceso HTTP a la API
│       ├── shared/               Estilos y funciones compartidas
│       ├── inicio/               Cuatro tarjetas y modales
│       ├── pacientes/            Listado y acceso al alta
│       ├── paciente-crear/       Alta independiente o con reserva
│       ├── paciente-detalle/     Ficha y edición
│       ├── agenda/               Semana, días y alta de horarios
│       ├── agendar/              Asignación de un horario
│       ├── sesiones/             Histórico de la semana actual
│       └── sesion-detalle/       Datos, realización y cobros
├── backend/
│   ├── src/
│   │   ├── server.ts             Configuración e inicio del servidor
│   │   ├── app.ts                Endpoints y operaciones de negocio
│   │   ├── models.ts             Contratos JSON de la API
│   │   ├── validar-paciente.ts   Validación de fichas
│   │   ├── calendario.ts         Fechas, semana y reloj de Buenos Aires
│   │   └── db/
│   │       ├── database.ts       Apertura, tablas y migraciones
│   │       └── seed.ts           Ejemplos históricos solo para pruebas
│   ├── test/                     Pruebas y fixtures temporales
│   ├── data/psique.sqlite        Base local generada; no se versiona
│   ├── dist/                     JavaScript compilado del backend
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── .env.example
└── www/                          Aplicación web compilada
```

### Frontend

Los componentes son `standalone`: cada pantalla declara las dependencias que usa. `app.routes.ts` registra `/inicio`, `/pacientes`, `/pacientes/nuevo`, `/pacientes/:codigo`, `/agenda`, `/agenda/agendar`, `/sesiones` y `/sesiones/:id`. La ruta estática `pacientes/nuevo` se declara antes de `pacientes/:codigo`.

La barra inferior mantiene Inicio, Pacientes y Agenda, con espacio propio para no cubrir el contenido. Las pantallas se organizan mediante `ion-router-outlet`, `RouterLink` y `NavController`. Ionic puede conservar una pantalla en memoria; `ionViewWillEnter` permite actualizar sus datos al regresar.

| Archivo o grupo | Responsabilidad |
| --- | --- |
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

`server.ts` carga la configuración, abre la base e inicia Express. `app.ts` configura JSON y CORS, define las rutas, valida los cuerpos y ejecuta operaciones SQL parametrizadas. `calendario.ts` centraliza el calendario de Buenos Aires; el reloj es inyectable para probar semanas y límites horarios sin depender del momento de ejecución.

La base contiene pacientes, días y horarios, y la tabla `sesiones`, que guarda paciente, fecha, hora, modalidad, estado, honorarios y total cobrado. Cada sesión corresponde a un horario único. `pendienteCentavos` se calcula al consultar como honorarios menos total cobrado.

`database.ts` activa claves foráneas y aplica migraciones con `PRAGMA user_version`. La **migración 1** conserva los pacientes y horarios existentes y agrega una sesión por cada turno previamente programado. Esas sesiones se importan como `Programada`, con honorarios y total cobrado en cero porque esos importes no existían en la base anterior. No se presume que ocurrieron: se confirman desde el detalle cuando corresponde. Reabrir la base no duplica esa migración.

Las tablas antiguas `semana_agenda` y `dias_agenda` se conservan para los horarios; la API arma semanas de siete días a partir de la fecha consultada. La tabla histórica `dashboard` puede seguir en la base por compatibilidad, pero sus números almacenados ya no alimentan Inicio.

`db/seed.ts` conserva ejemplos de la etapa anterior para pruebas explícitas de migración. El servidor no lo importa ni ejecuta al iniciar. `test/fixtures.mjs` prepara bases temporales con esos datos cuando una prueba los necesita. Una instalación vacía permanece vacía hasta que se crean registros desde la aplicación o la API.

Las operaciones que deben guardarse juntas usan transacciones inmediatas: alta con reserva, asignación de horario y cambio de identificador. En el renombrado se difiere la verificación de claves foráneas hasta finalizar la transacción, de modo que paciente, turnos y sesiones cambian de referencia como una sola operación.

## API HTTP

Todas las rutas parten de `/api`. Las consultas correctas y las actualizaciones devuelven `200`; las altas, `201`. Los errores usan `400` para datos inválidos, `404` para un recurso inexistente, `409` para conflictos como código duplicado u horario ocupado, `413` para un JSON que supera 32 KB, y `500` para un fallo interno.

| Método y ruta | Datos o comportamiento |
| --- | --- |
| `GET /pacientes` | Arreglo de pacientes, ordenado por código. |
| `GET /pacientes/siguiente-codigo` | `{ codigo }` sugerido; no lo reserva. |
| `GET /pacientes/:codigo` | Ficha de un paciente. |
| `POST /pacientes` | Recibe `{ paciente, turno? }`; devuelve `{ paciente, sesion }`. La sesión es `null` en un alta independiente. |
| `PUT /pacientes/:codigo` | Reemplaza los datos editables de la ficha identificada por el código anterior. `fechaCreacion` puede omitirse o conservar su valor; no puede cambiar. |
| `GET /sesiones/semana` | `{ desde, hasta, sesiones }` de las realizadas en la semana actual. |
| `GET /sesiones/pendientes` | Arreglo de sesiones realizadas con saldo, de cualquier fecha. |
| `GET /sesiones/:id` | Datos e importes de una sesión. |
| `POST /sesiones` | Recibe `{ fecha, horario, codigoPaciente, modalidad, importeCentavos }` y reserva un horario existente futuro. Devuelve la sesión. |
| `POST /sesiones/:id/realizar` | Confirma que ocurrió una sesión cuyo horario ya llegó. Devuelve la sesión realizada. |
| `PUT /sesiones/:id` | Recibe `{ importeCentavos, pagadoCentavos }` y devuelve la sesión con el saldo calculado. |
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

La aplicación funciona localmente y tiene persistencia, pero todavía requiere trabajo antes de un uso clínico real: autenticación, control de acceso, protección y copias de seguridad de datos, y configuración de despliegue. Tampoco incluye múltiples profesionales, cancelaciones/reprogramaciones, recurrencia automática ni un historial individual de movimientos de pago. El destino móvil y la distribución instalable continúan como pasos posteriores.

## Archivos de configuración de la raíz

### `angular.json`

Es la configuración que utiliza Angular CLI para compilar y servir el proyecto
`psique`. Indica que el código está en `src`, que comienza en `src/main.ts` y que
usa `src/index.html` como página base. También selecciona `src/global.scss` para
los estilos generales y `tsconfig.app.json` para las reglas de TypeScript.

La tarea `build` usa `@angular/build:application` y tiene `outputPath: "www"`:
por eso los archivos compilados se generan en esa carpeta. Su configuración
predeterminada es `production`, con nombres de salida que incluyen un identificador
de contenido (`outputHashing: "all"`) para que el navegador distinga las versiones.
Los `budgets` avisan o detienen la compilación si el tamaño inicial de la aplicación
o los estilos de un componente superan los límites configurados.

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
- `scripts.build`: ejecuta `ng build`; genera la versión de producción mediante
  `npm.cmd run build`.
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

`www` es el resultado generado al ejecutar `npm.cmd run build`. Angular transforma
TypeScript, las plantillas HTML y los estilos SCSS en archivos que el navegador
puede cargar. La estructura generada actualmente es:

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

Verificación completada el **05/10/2026**:

- Compilación del frontend y del backend correcta; frontend sin advertencias.
- Backend: **36 casos efectivos aprobados** (39 resultados al incluir los tres contenedores del ejecutor de Node), con bases SQLite temporales. Incluyen migración y persistencia, fecha de creación inmutable, reservas concurrentes, reversión completa ante fallos y límites del calendario de Buenos Aires.
- Navegador: **56 comprobaciones aprobadas**, con una API y una base temporales. Se verificaron los cuatro accesos de Inicio, altas independientes y con reserva, conflictos sin altas parciales, confirmación manual de sesiones, cobros y contadores, navegación entre semanas, recarga, errores y estados vacíos. También se comprobaron teclado y presentación en PC y anchos de 360 y 320 píxeles.
- Se respaldó la base local antes de actualizarla. La migración conservó sus pacientes y horarios originales, convirtió los turnos asignados en sesiones programadas sin inventar importes y mantuvo válidas las relaciones entre registros.

Para recorrer la aplicación con datos propios de prueba:

1. Abrí Pacientes y creá un paciente con un alias. Confirmá que aparece en el listado y que su ficha muestra la fecha de creación sin permitir editarla.
2. Editá algún dato, cancelá y comprobá que conserva su valor. Después guardá un cambio de código y revisá la ficha actualizada.
3. En Agenda, agregá un horario futuro y seleccioná **Agendar sesión**. Elegí el paciente, la modalidad y los honorarios; guardá y abrí el detalle.
4. Volvé a Inicio. El horario reservado ya no debe figurar entre los disponibles. Una sesión programada no incrementa todavía las sesiones realizadas ni los pendientes de cobro.
5. Agregá otro horario y usá **Crear paciente** desde el agendamiento. Revisá el contexto; **Crear paciente y agendar** debe guardar ambos registros y abrir la sesión. Cancelar el alta debe volver sin guardar ninguno.
6. Cuando haya llegado el horario de una sesión, marcala como realizada. Si pertenece a la semana actual debe figurar en el histórico; si tiene saldo, también en el modal de pendientes.
7. Registrá un cobro parcial y verificá el saldo; después completá el total acumulado y comprobá que desaparece de pendientes.
8. Reiniciá frontend y backend y comprobá que los cambios siguen guardados. Recorré Agenda por semanas anteriores y siguientes para consultar las fechas correspondientes.

Los casos de prueba que necesitan fechas pasadas o cambios de reloj deben usar una base aislada y el reloj inyectable del backend; no hace falta cambiar el reloj de Windows ni alterar registros del consultorio. Las pruebas de errores deben comprobar que se muestran mensajes útiles y se conserva el borrador, sin confirmar un guardado que no ocurrió.
