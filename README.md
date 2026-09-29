# PSIQUE

Aplicación de seguimiento psicoterapéutico y administración de consultorio, con
frontend Ionic y Angular, API REST en Node.js, Express y TypeScript, y persistencia
local en SQLite.

Esta etapa cambia el origen de los datos. Se conservan las pantallas **Inicio**,
**Pacientes**, **Ficha del paciente** y **Agenda**, su diseño y los recorridos de
consulta. Los datos de ejemplo ahora se inicializan en el backend y se consultan
por HTTP. No se incorporan nuevas funciones de administración.

## Arquitectura actual

```text
Pantalla de Angular
        ↓
PacientesService / AgendaService / DashboardService
        ↓
HttpClient → GET http://127.0.0.1:3000/api/...
        ↓
Express → consulta SQL → archivo SQLite
        ↓
Respuesta JSON → Observable → AsyncPipe → pantalla
```

El frontend se ejecuta en el navegador. El backend es un proceso separado que
recibe solicitudes y consulta SQLite. La base es un archivo local del backend:
sus registros permanecen al cerrar el navegador o reiniciar los procesos.

Los datos siguen siendo **ficticios**, pero las solicitudes HTTP y la persistencia
son reales. Esta versión no está preparada para almacenar información clínica real.

## CÓMO EJECUTAR FRONTEND Y BACKEND

Se necesitan dos terminales de PowerShell. Los ejemplos parten de la carpeta
`APP-PSIQUE`; si abrís el proyecto desde otro lugar, ubicá primero cada terminal
en la ruta indicada.

El entorno utilizado es **Node.js 24.14.1, npm 11.11.0, Windows x64**. El backend
utiliza Express 5 y `better-sqlite3` 13.0.3 para acceder a SQLite. No hace falta
instalar un servidor SQLite por separado, Angular CLI o Ionic de forma global.

Se eligió `better-sqlite3` por su API directa y porque incluye un binario para
Windows x64, instalado y probado en este entorno sin herramientas de compilación
nativa adicionales. Las [notas oficiales de la versión 13](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)
documentan esos binarios. El módulo integrado `node:sqlite` todavía figura como
experimental en la [documentación de Node 24.14.1](https://raw.githubusercontent.com/nodejs/node/v24.14.1/doc/api/sqlite.md),
por lo que no se utiliza en este backend.
El backend declara Node 24.x desde la versión 24.14.1; este requisito se debe
respetar aunque el frontend admita también otras versiones de Node.

### Terminal 1: backend

Desde la raíz del proyecto:

```powershell
Set-Location .\backend
npm.cmd install
npm.cmd run dev
```

El servidor escucha en **http://127.0.0.1:3000**. Al iniciar, crea la carpeta y
el archivo `backend/data/psique.sqlite` si faltan, prepara las tablas y carga los
datos iniciales únicamente cuando la base está vacía. No hay que ejecutar un
comando de seed adicional.

`npm.cmd run dev` utiliza Node con `--watch`: ejecuta el TypeScript compatible
con Node y reinicia el proceso al cambiar sus archivos. Este modo no reemplaza
la comprobación de tipos; para eso se ejecuta la compilación.

### Terminal 2: frontend

Desde la raíz del proyecto, sin entrar en `backend`:

```powershell
npm.cmd install
npm.cmd start
```

Abrí **http://127.0.0.1:4200**. Mantené ambas terminales abiertas: Angular sirve
la interfaz y Express proporciona los datos. Para detener cada proceso,
presioná `Ctrl+C` en su terminal.

Las instalaciones son necesarias la primera vez o cuando cambian las dependencias.
La raíz y `backend` tienen sus propios `package.json`, archivos de bloqueo y
carpetas `node_modules`. Usamos `npm.cmd` para evitar restricciones de scripts
de PowerShell.

### Compilar, ejecutar el backend compilado y probar

Dentro de `backend`:

```powershell
npm.cmd run build
npm.cmd start
```

`build` comprueba los tipos y genera JavaScript en `backend/dist`. `start` ejecuta
`dist/server.js`; requiere una compilación previa. Usá `dev` o `start`, uno por
vez para el mismo puerto. Ninguno borra ni restaura los datos existentes.

Para las pruebas del backend, desde `backend`:

```powershell
npm.cmd test
```

Este comando compila y ejecuta las pruebas de `test/api.test.mjs` con el ejecutor
de pruebas de Node. Las pruebas utilizan bases temporales y no necesitan reemplazar
el archivo de datos de desarrollo.

Para compilar el frontend, desde la raíz:

```powershell
npm.cmd run build
```

La salida web queda en `www/browser`. Compilar el frontend no inicia Express
ni incluye la base SQLite dentro de esa carpeta.

### Configuración local

El backend funciona con valores predeterminados. Si necesitás cambiarlos, creá
`backend/.env` copiando `backend/.env.example` una vez, desde `backend`:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

No repitas la copia sobre un `.env` que ya personalizaste. Node carga ese archivo
opcional con `--env-file-if-exists=.env` en los comandos `dev` y `start`.

| Variable del backend | Valor predeterminado | Para qué sirve |
| --- | --- | --- |
| `PORT` | `3000` | Puerto de Express. |
| `DB_PATH` | `data/psique.sqlite` | Archivo SQLite; una ruta relativa se resuelve desde `backend`. También admite una ruta absoluta. |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:4200` | Origen del navegador permitido por CORS. |

El servidor se limita a `127.0.0.1` para esta etapa local. La URL de la API está
centralizada en **`src/app/api.config.ts`**:

```typescript
export const API_BASE_URL = 'http://127.0.0.1:3000/api';
```

Si cambiás `PORT`, actualizá también esa URL. Si cambiás la dirección desde la que
abrís Angular, ajustá `FRONTEND_ORIGIN`. `localhost` y `127.0.0.1` son orígenes
distintos para el navegador; con la configuración inicial usá las direcciones
`127.0.0.1` indicadas arriba.

La base local, sus archivos auxiliares, `.env`, dependencias y compilaciones
del backend no se versionan. El archivo de ejemplo de configuración sí se
incluye y no contiene secretos. La instalación inicial requiere descargar
dependencias; después, frontend, backend y SQLite funcionan localmente.

## Pantallas y datos conservados

Inicio mantiene cuatro tarjetas con igual altura, grilla de 2 × 2 en escritorio
y una columna en pantallas pequeñas. Conserva colores, bordes, tipografía e
iconos de personas, calendario, tarjeta y reloj de Ionicons.

| Indicador | Valor almacenado | Texto secundario |
| --- | --- | --- |
| Pacientes activos | 3 | Tratamientos en curso |
| Sesiones de la semana | 8 | Actividad semanal del consultorio |
| Pendientes de cobro | 2 | Sesiones pendientes de pago |
| Horarios disponibles | 4 | Disponibles esta semana |

Estos cuatro números se almacenan en la tabla `dashboard`. **No se calculan**
a partir de pacientes o turnos: Agenda contiene dos turnos programados y eso no
modifica el valor 8. Tampoco hay lógica de pagos o cálculo real de disponibilidad.

Pacientes conserva las tarjetas seleccionables, el horario de próxima sesión
arriba a la derecha y la fecha de creación abajo a la derecha:

| Código | Modalidad | Estado | Próxima sesión | Fecha de creación |
| --- | --- | --- | --- | --- |
| P-001 | Presencial | Activo | LUN 15 HS | 01/09/2026 |
| P-002 | Virtual | Activo | MIÉ 10:30 HS | 02/09/2026 |
| P-003 | Presencial | Activo | `null`; no se muestra | 05/09/2026 |

Cada ficha mantiene código, estado, modalidad, frecuencia, día y horario habitual,
fecha de inicio del tratamiento, motivo de consulta y Post-it destacado en terracota.
P-001 tiene frecuencia semanal, lunes a las 15:00; P-002, semanal, miércoles a las
10:30; P-003, quincenal, con día y horario en `null`, mostrados como **Sin definir**.
Los textos y fechas iniciales son los mismos del prototipo anterior.

### Agenda

La semana sigue siendo del **7 al 13 de septiembre de 2026**. No se convierte
automáticamente en la semana actual.

| Día | Horarios recibidos de la API, en orden |
| --- | --- |
| Lunes 7 | 09:00 Disponible; 11:00 Horario liberado; 15:00 P-001, Presencial, Programado. |
| Martes 8 | 09:00, 11:00 y 15:00 Disponibles. |
| Miércoles 9 | 09:00 Disponible; 10:30 P-002, Virtual, Programado; 12:00 Disponible. |
| Jueves 10 | 09:00 y 11:00 Disponibles. |
| Viernes 11 | 09:00, 11:00 y 15:00 Disponibles. |
| Sábado 12 | Sin horarios cargados. |
| Domingo 13 | Sin horarios cargados. |

P-003 permanece sin turno asignado. **Horario liberado** representa visualmente
el concepto; no existe una operación de cancelación o reasignación.

La API entrega la semana completa. `indiceDiaSeleccionado` comienza en `0`,
correspondiente al lunes. El evento `(click)="seleccionarDia(indice)"` cambia esa
posición y Angular presenta `semana.dias[indiceDiaSeleccionado]`. Seleccionar
otro día no envía otra solicitud ni modifica SQLite: es estado de la interfaz.

`DatePipe` muestra el número de día y las fechas con formato `dd/MM/yyyy`.
`@for` presenta los turnos y `@empty` muestra **Sin horarios cargados para este día.**
cuando el arreglo está vacío. Un día sin registros no equivale a un día con
horarios disponibles.

### Navegación

La barra inferior conserva **Inicio**, **Pacientes** y **Agenda**. Para el
recorrido de consulta, elegí **Pacientes** en esa barra y luego una tarjeta:
**Inicio → Pacientes → Ficha**. La tarjeta forma una ruta como `/pacientes/P-001`.

La barra vive en `app.component.html`, fuera de `ion-router-outlet`, y tiene
su propio espacio para no tapar el contenido. `RouterLink` y
`IonRouterLinkWithHref` realizan la navegación; `routerDirection="root"` abre
cada sección principal.

`RouterLinkActive` marca la sección actual. Inicio exige coincidencia exacta
con `/inicio`; Pacientes también queda activo dentro de una ficha.
`ariaCurrentWhenActive="page"` comunica esa selección a las herramientas de
accesibilidad. Los botones de regreso de la ficha y del listado se conservan.

## Organización del proyecto

```text
APP-PSIQUE/
├── src/                         Frontend Ionic + Angular
│   └── app/
│       ├── api.config.ts        URL base de la API
│       ├── app.config.ts        Proveedores de Angular, incluido HttpClient
│       ├── app.routes.ts        Rutas de las pantallas
│       ├── models/              Contratos de datos del frontend
│       ├── services/            Consultas HTTP
│       ├── inicio/
│       ├── pacientes/
│       ├── paciente-detalle/
│       └── agenda/
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── models.ts
│   │   └── db/
│   │       ├── database.ts
│   │       └── seed.ts
│   ├── test/api.test.mjs
│   ├── data/psique.sqlite       Generado localmente; no se versiona
│   ├── dist/                    Generado al compilar el backend
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── .env.example
├── www/                         Frontend compilado
└── archivos de configuración del frontend
```

### Responsabilidades del frontend

| Archivo o grupo | Responsabilidad |
| --- | --- |
| `src/main.ts` | Inicia Angular. |
| `src/app/app.config.ts` | Configura Ionic, rutas y `provideHttpClient()` para inyectar `HttpClient`. |
| `src/app/api.config.ts` | Declara `API_BASE_URL` en un único lugar. |
| `src/app/app.component.ts/html/scss` | Organiza el contenedor, las pantallas y la barra inferior. |
| `src/app/app.routes.ts` | Declara `/inicio`, `/pacientes`, `/pacientes/:codigo` y `/agenda`. |
| `src/app/models/paciente.ts` | Define los once campos de `Paciente`, incluidos los valores que admiten `null`. |
| `src/app/models/turno.ts` | Define `Turno`, `DiaAgenda` y `SemanaAgenda`. |
| `src/app/models/dashboard.ts` | Define los cuatro números de `ResumenDashboard`. |
| `src/app/services/pacientes.service.ts` | Solicita todos los pacientes o uno por código; transforma el 404 de una ficha en `undefined`. |
| `src/app/services/agenda.service.ts` | Solicita la semana completa mediante `GET /api/agenda`. |
| `src/app/services/dashboard.service.ts` | Solicita los indicadores mediante `GET /api/dashboard`. |
| `src/app/inicio/inicio.page.ts/html/scss` | Presenta el resumen recibido en `resumen$` y sus estados de carga o error. |
| `src/app/pacientes/pacientes.page.ts/html/scss` | Presenta `pacientes$` y los enlaces hacia las fichas. |
| `src/app/paciente-detalle/paciente-detalle.page.ts/html/scss` | Obtiene el código de la ruta y presenta `paciente$`, un error de carga o el caso inexistente. |
| `src/app/agenda/agenda.page.ts/html/scss` | Presenta `semana$` y mantiene localmente la selección del día. |
| `src/global.scss` | Carga estilos generales, tipografía y estilos base de Ionic. |

Los HTML solo incorporan los mensajes mínimos de carga y error. Se conservan
la estructura visual, los estilos y la navegación.

Se eliminaron del frontend los archivos que ya no se utilizan:
`src/app/data/pacientes.mock.ts`, `src/app/data/agenda.mock.ts` y
`src/app/data/dashboard.mock.ts`. Sus datos iniciales están ahora en el seed del
backend; no existe una copia de reserva que las pantallas utilicen cuando falla la API.

### Responsabilidades del backend

| Archivo | Responsabilidad |
| --- | --- |
| `backend/src/server.ts` | Lee la configuración, abre la base e inicia Express en el puerto local. |
| `backend/src/app.ts` | Configura CORS, define los endpoints GET y transforma las consultas en respuestas JSON. |
| `backend/src/models.ts` | Describe los datos que devuelve la API mediante interfaces TypeScript. |
| `backend/src/db/database.ts` | Abre SQLite, crea las tablas y coordina la inicialización. |
| `backend/src/db/seed.ts` | Contiene los datos ficticios iniciales e inserta el conjunto de ejemplo cuando corresponde. |
| `backend/test/api.test.mjs` | Comprueba la API y la persistencia con bases temporales. |
| `backend/package.json` | Declara dependencias y comandos propios del servidor. |
| `backend/package-lock.json` | Fija las versiones resueltas de sus dependencias. |
| `backend/tsconfig.json` | Configura TypeScript para compilar `src` en `dist`. |
| `backend/.env.example` | Documenta variables de entorno con valores locales de ejemplo. |

El backend utiliza consultas SQL directas y `better-sqlite3`. No incorpora ORM,
Docker ni capas de arquitectura adicionales. Mantiene sus dependencias y su
compilación separadas del frontend.

## Endpoints de la API

URL base: `http://127.0.0.1:3000/api`. Las respuestas tienen formato JSON.

| Método | Endpoint | Respuesta correcta |
| --- | --- | --- |
| GET | `/api/dashboard` | HTTP 200, objeto con los cuatro indicadores. |
| GET | `/api/pacientes` | HTTP 200, arreglo con P-001, P-002 y P-003. |
| GET | `/api/pacientes/:codigo` | HTTP 200, objeto del paciente; HTTP 404 si el código no existe. |
| GET | `/api/agenda` | HTTP 200, objeto con el título, siete días y sus turnos. |

Estos son endpoints de consulta. No existen operaciones POST, PUT, PATCH o DELETE
para crear, editar o eliminar datos.

### Ejemplo: Dashboard

`GET /api/dashboard` devuelve:

```json
{
  "pacientesActivos": 3,
  "sesionesSemana": 8,
  "pendientesCobro": 2,
  "horariosDisponibles": 4
}
```

### Ejemplo: ficha y listado

`GET /api/pacientes/P-001` devuelve:

```json
{
  "codigo": "P-001",
  "modalidad": "Presencial",
  "estado": "Activo",
  "proximaSesion": "LUN 15 HS",
  "frecuencia": "Semanal",
  "diaHabitual": "Lunes",
  "horarioHabitual": "15:00",
  "fechaCreacion": "2026-09-01",
  "fechaInicioTratamiento": "2026-09-01",
  "motivoConsulta": "Dificultades vinculadas a situaciones de ansiedad.",
  "postIt": "Retomar situaciones que generan mayor ansiedad durante la semana."
}
```

`GET /api/pacientes` devuelve un arreglo de tres objetos con esta misma estructura.
En P-003, `proximaSesion`, `diaHabitual` y `horarioHabitual` conservan `null`;
no se sustituyen por una cadena vacía.

`GET /api/pacientes/P-999` devuelve HTTP 404 y:

```json
{
  "mensaje": "Paciente no encontrado"
}
```

### Ejemplo: Agenda

`GET /api/agenda` devuelve el título y los siete días. Este fragmento muestra
únicamente el lunes del objeto completo:

```json
{
  "titulo": "7 al 13 de septiembre de 2026",
  "dias": [
    {
      "fecha": "2026-09-07",
      "nombre": "Lunes",
      "turnos": [
        {
          "horario": "09:00",
          "codigoPaciente": null,
          "modalidad": null,
          "estado": "Disponible"
        },
        {
          "horario": "11:00",
          "codigoPaciente": null,
          "modalidad": null,
          "estado": "Liberado"
        },
        {
          "horario": "15:00",
          "codigoPaciente": "P-001",
          "modalidad": "Presencial",
          "estado": "Programado"
        }
      ]
    }
  ]
}
```

La respuesta completa incluye martes a domingo; sábado y domingo tienen
`"turnos": []`. SQL y el armado de la respuesta conservan el orden de los días
y de los horarios.

## SQLite: tablas, inicialización y persistencia

La base predeterminada es `backend/data/psique.sqlite`. Contiene únicamente
las tablas necesarias para representar los datos existentes:

| Tabla | Contenido |
| --- | --- |
| `pacientes` | Tres pacientes, sus datos de seguimiento y Post-it. |
| `semana_agenda` | Título de la semana de ejemplo. |
| `dias_agenda` | Las siete fechas y sus nombres. |
| `turnos` | Los horarios de cada día, códigos, modalidades y estados. |
| `dashboard` | Los cuatro indicadores fijos 3, 8, 2 y 4. |

Al iniciar el servidor se crean las tablas si faltan. Si las **cinco tablas están
vacías**, el seed inserta los datos del prototipo en una transacción: se completa
todo el conjunto o se revierte la inserción. Si ya hay datos, no vuelve a sembrar
ni sobrescribe registros. No se utiliza el reinicio para reparar o rellenar
automáticamente una base parcialmente modificada.

Las fechas se conservan como texto ISO `YYYY-MM-DD`; las horas, como `HH:mm`.
Los campos sin valor usan `NULL` en SQLite y llegan como `null` en JSON. Los
valores del Dashboard son registros almacenados, no resultados de estadísticas.

La persistencia significa que el archivo SQLite conserva sus registros aunque
se cierre el frontend o se reinicie Express. Los GET consultan ese archivo.
Los textos del seed sirven para la primera inicialización; cambiarlos no
actualiza automáticamente una base que ya contiene datos.

No hay un servidor de base de datos independiente ni un comando adicional de
instalación de SQLite. El archivo local y sus posibles auxiliares no se suben
al repositorio. Las pruebas usan otra ubicación temporal para verificar reinicios
y evitar duplicados sin alterar la base de desarrollo.

## Cómo llegan los datos HTTP a las pantallas

Los servicios mantienen los contratos que ya consumían los componentes:

| Método Angular | Tipo devuelto | Solicitud |
| --- | --- | --- |
| `DashboardService.obtenerResumen()` | `Observable<ResumenDashboard>` | GET `/dashboard` |
| `PacientesService.obtenerPacientes()` | `Observable<Paciente[]>` | GET `/pacientes` |
| `PacientesService.obtenerPacientePorCodigo(codigo)` | `Observable<Paciente \| undefined>` | GET `/pacientes/:codigo` |
| `AgendaService.obtenerSemana()` | `Observable<SemanaAgenda>` | GET `/agenda` |

Las rutas de esta tabla se agregan a `API_BASE_URL`. `provideHttpClient()` registra
el cliente HTTP en Angular; cada servicio lo obtiene mediante `inject(HttpClient)`.

Por ejemplo, al abrir una ficha:

1. La tarjeta navega a `/pacientes/P-001` mediante `RouterLink`.
2. `ActivatedRoute.paramMap` entrega el parámetro `codigo`. `switchMap` lo convierte
   en una llamada a `PacientesService.obtenerPacientePorCodigo`.
3. `HttpClient.get<Paciente>(...)` produce el Observable de la solicitud.
   `AsyncPipe` se suscribe desde el HTML y Angular envía el GET.
4. Express recibe el código, consulta SQLite y responde con el objeto JSON.
5. `HttpClient` entrega el objeto al Observable y `AsyncPipe` lo deja disponible
   para mostrar los campos con interpolación, como `{{ paciente.codigo }}`.

Los modelos TypeScript ayudan a comprobar cómo usamos esos objetos en el código;
no validan automáticamente el contenido de una respuesta externa en ejecución.

### Paciente inexistente y errores de carga

Un paciente inexistente es diferente de una API que no responde:

- Si la ficha recibe HTTP 404, `PacientesService` convierte ese error en
  `of(undefined)`. Se conserva el mensaje **Paciente no encontrado** y el botón
  para volver a Pacientes.
- Si ocurre otro error HTTP o de conexión, el servicio lo propaga. La pantalla
  muestra un mensaje de carga fallida y permite volver a intentar recargando.
- Mientras espera la respuesta, la pantalla muestra un mensaje de carga.
  No presenta temporalmente un paciente inexistente ni valores numéricos en cero.

Los componentes mantienen `cargando` y `errorCarga`. `catchError` registra el
estado de error de presentación y devuelve `EMPTY` para terminar la secuencia
sin inventar datos. `finalize` apaga el indicador de carga cuando la consulta
termina, falla o se cancela. No hay un retorno a mocks ni reintentos automáticos.

Después de arrancar de nuevo el backend, recargá la página que mostró el error.
Ionic puede conservar pantallas ya visitadas; una recarga permite comprobar una
nueva solicitud HTTP y evita confundir una vista anterior con datos recién obtenidos.

### CORS

Angular se sirve en `http://127.0.0.1:4200` y la API en
`http://127.0.0.1:3000`. Aunque ambos son locales, el puerto distinto hace que
sean orígenes diferentes. El navegador necesita que la API autorice ese origen
para permitir que Angular lea sus respuestas.

Express configura CORS para el origen de desarrollo indicado en
`FRONTEND_ORIGIN` y las consultas GET. CORS es una regla del navegador;
**no autentica usuarios ni protege la API frente a otros clientes HTTP**.

## Alcance y seguridad de esta etapa

La API y SQLite son reales; el contenido inicial es ficticio y se mantiene
únicamente para demostrar el flujo existente. No usar esta versión con
información clínica real.

No se implementaron login, registro, Google Sign-In, JWT, roles, gestión de
usuarios, cifrado de la base, cifrado de extremo a extremo o bloqueo automático.
La comunicación local utiliza HTTP y no existe separación de datos por profesional.

Tampoco se agregaron creación, edición, eliminación, formularios, historial,
objetivos, pagos reales, honorarios, lista de espera, notificaciones, cambio de
semana, calendario mensual, recurrencias, cancelaciones ni estadísticas calculadas.

El servidor no necesita registrar los cuerpos de respuesta ni contenido clínico
para atender las consultas. Las variables locales de configuración se mantienen
fuera del código cuando corresponde; `.env.example` muestra valores de desarrollo,
sin credenciales.

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

## Conceptos para comprender y defender el proyecto

| Concepto | Qué significa en PSIQUE |
| --- | --- |
| API REST | Interfaz de consulta por HTTP que expone recursos como pacientes o agenda mediante direcciones y métodos definidos. |
| Endpoint | Combinación de método y ruta: por ejemplo, `GET /api/pacientes/P-001`. |
| Node.js | Ejecuta el código del servidor fuera del navegador. |
| Express | Recibe las solicitudes, identifica la ruta y devuelve el estado HTTP y el JSON correspondiente. |
| SQLite | Motor que almacena tablas y registros en un archivo local; no necesita un servicio separado de base de datos. |
| GET | Solicita datos; estos endpoints no modifican registros. |
| HTTP 200 / 404 | 200 indica una respuesta correcta; 404 indica que el recurso solicitado no fue encontrado. |
| JSON | Formato con objetos, arreglos, números, textos y `null` utilizado entre backend y frontend. |
| Consulta parametrizada | Envía el código del paciente separado del SQL, como valor del parámetro `?`, para no tratarlo como una instrucción SQL. |
| Seed | Carga inicial de los datos ficticios en una base vacía. No se repite sobre una base que ya tiene datos. |
| Transacción | Agrupa las inserciones del seed para completarlas juntas o revertirlas ante un error. |
| Persistencia | Los registros quedan en SQLite, fuera del frontend y del proceso de Express. |
| CORS | Permite al navegador leer respuestas de otro origen autorizado; no equivale a autenticación. |

Una **interfaz TypeScript** define el contrato esperado. `Paciente` mantiene los
once campos de la ficha; `ResumenDashboard`, los cuatro indicadores numéricos;
`SemanaAgenda` agrupa `DiaAgenda` y sus `Turno`. Cada turno tiene `horario`,
`codigoPaciente`, `modalidad` y `estado`. Los horarios libres conservan código y
modalidad en `null`, y los estados son `Programado`, `Disponible` o `Liberado`.

Un **servicio Angular** concentra la consulta HTTP. `providedIn: 'root'` lo deja
disponible en la aplicación y `inject` permite recibir esa dependencia. La
pantalla se ocupa de presentar la respuesta, sin conocer las tablas ni escribir SQL.

Un **Observable** representa la entrega de una respuesta o un error. `HttpClient`
devuelve Observables y envía la solicitud cuando hay una suscripción. El sufijo
`$` en `resumen$`, `pacientes$`, `paciente$` y `semana$` es una convención de nombres.

**`AsyncPipe`**, mediante `| async`, se suscribe y entrega el resultado al HTML;
administra la suscripción y la libera cuando el componente se destruye o cambia
el Observable. `@let resumen = resumen$ | async;` permite mantener esa suscripción
antes de elegir qué estado mostrar con `@if`: carga, error o datos.

**`ActivatedRoute.paramMap`** entrega el código presente en la URL.
**`switchMap`** lo transforma en la consulta a la API; si cambia el código, deja
de escuchar la consulta anterior y utiliza la nueva. En la ficha, el manejo de
errores está dentro de esa consulta, por lo que no termina el flujo que escucha
cambios de ruta.

**Interpolación**, como `{{ resumen.pacientesActivos }}`, muestra una propiedad.
**`@for`** repite las tarjetas o los turnos; `track` identifica cada elemento.
**`@if`** selecciona qué mostrar según carga, error, existencia de datos o un
campo opcional. **`DatePipe`** transforma la presentación de una fecha ISO a
`dd/MM/yyyy` sin alterar el valor almacenado. **`??`** permite mostrar
**Sin definir** para un día u horario habitual ausente.

Los componentes son **standalone**: declaran sus dependencias de plantilla en
`imports`. Las rutas usan `loadComponent` para cargar cada pantalla.
Los estilos SCSS y las reglas `@media` conservan la adaptación a PC y móvil.

## Verificación y demo

La compilación comprueba los tipos; las pruebas del backend comprueban además
las respuestas HTTP y el comportamiento de SQLite. Son comprobaciones diferentes.

Verificación de esta integración, realizada el **28/09/2026**:

- Compilaciones del frontend y backend correctas; frontend sin advertencias.
- Pruebas del backend correctas: ocho casos y su prueba contenedora, nueve
  resultados informados por el ejecutor de Node.
- Respuestas de la API comparadas con los datos originales, incluido HTTP 404
  para P-999; persistencia y seed sin duplicados comprobados.
- Arranque mediante `dev` y mediante el JavaScript compilado de `start` comprobados.
- Recorrido en navegador a 1440 × 1080 y 360 × 800, con solicitudes HTTP reales,
  navegación activa y conservación del diseño.
- Estados de carga, HTTP 500 en las cuatro pantallas y fallo de conexión en
  la ficha comprobados, diferenciándolos del paciente inexistente.

Desde `backend`, `npm.cmd test` compila y ejecuta el conjunto de pruebas. Comprueba:

- Campos, textos y valores `null` de pacientes y fichas.
- HTTP 404 del paciente inexistente.
- Semana, días y horarios de agenda, y los cuatro valores del Dashboard.
- Configuración de CORS y consultas con códigos que no deben alterar el SQL.
- Persistencia al cerrar y abrir la base, ausencia de duplicados y ausencia de
  restauración de los valores iniciales sobre datos ya existentes.

Las pruebas crean un archivo SQLite temporal y usan un puerto asignado por el
sistema. No leen ni modifican `backend/data/psique.sqlite`. Así pueden probar
persistencia y reinicios sin alterar los datos de la demo.

### Comprobar la API por separado

Con Express iniciado, ejecutá desde una terminal libre:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/dashboard'
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/pacientes'
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/pacientes/P-001'
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/agenda'
```

Para el caso inexistente, `curl.exe` permite ver el código de estado y el cuerpo:

```powershell
curl.exe -i 'http://127.0.0.1:3000/api/pacientes/P-999'
```

Debe devolver HTTP 404 con `{"mensaje":"Paciente no encontrado"}`.
En el navegador, la pestaña **Red/Network** de las herramientas de desarrollo
permite observar las solicitudes `/api/...` y sus respuestas JSON.

### Recorrer las pantallas

1. Abrí `http://127.0.0.1:4200/inicio`. Comprobá los cuatro valores **3, 8, 2 y 4**,
   sus textos secundarios y la grilla de 2 × 2 en una ventana amplia.
2. Elegí **Pacientes** en la barra inferior. Deben aparecer P-001, P-002 y P-003
   con los mismos estados, modalidades, horarios y fechas.
3. Abrí P-001 y revisá la ficha y el Post-it. Volvé con **Pacientes** y consultá
   P-002 y P-003. Este último debe mantener **Sin definir** en día y horario.
4. Abrí directamente `/pacientes/P-002` en una pestaña nueva y recargá. La ficha
   debe consultar el backend y mantener disponible el regreso al listado.
5. Abrí `http://127.0.0.1:4200/pacientes/P-999`. Con la API funcionando debe
   mostrar **Paciente no encontrado**, y no un error de conexión.
6. Elegí **Agenda**. Revisá el lunes, su horario liberado y P-001 a las 15:00;
   el miércoles, P-002 a las 10:30. Seleccioná los siete días: sábado y domingo
   deben mostrar **Sin horarios cargados para este día.**
7. Observá Red/Network mientras cambiás de día: la selección usa la semana
   recibida, sin pedir otra vez la API por cada día.
8. Volvé a Inicio: los indicadores siguen siendo 3, 8, 2 y 4 porque se leen
   de un resumen almacenado, sin calcularse a partir de la agenda.
9. Reducí el ancho de la ventana y comprobá las tarjetas, la ficha, los turnos
   y la barra inferior. Revisá que pueda alcanzarse todo el contenido y que la
   navegación marque Pacientes también dentro de una ficha.

### Distinguir carga, fallos y persistencia

- Para observar la carga, usá una conexión lenta simulada desde Red/Network y
  recargá. Debe aparecer el mensaje correspondiente, como **Cargando resumen...**,
  hasta recibir la respuesta.
- Detené solo Express con `Ctrl+C` y recargá una pantalla. Debe mostrar un mensaje
  como **No se pudo cargar el resumen. Recargá la página para volver a intentar.**
  No deben aparecer cifras en cero ni pacientes de reserva.
- Con Express detenido, una ficha tampoco debe afirmar **Paciente no encontrado**:
  ese mensaje corresponde al 404 que devuelve una API disponible.
- Reiniciá Express y recargá el frontend. Los datos deben volver a mostrarse desde
  el mismo archivo SQLite. El listado debe conservar tres pacientes, sin duplicados.
- El control de que un valor modificado permanezca tras reabrir la base se realiza
  en las pruebas temporales; no requiere editar la base utilizada por la demo.

Para la defensa oral, seguí una consulta completa: ruta de Angular → servicio →
`HttpClient` → endpoint de Express → SQL → JSON → Observable → `AsyncPipe` →
pantalla. Diferenciá **datos ficticios** de **almacenamiento real** y
**indicadores almacenados** de **estadísticas calculadas**.
