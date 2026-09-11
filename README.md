# PSIQUE

Prototipo de PSIQUE con pantallas **Inicio**, **Pacientes**, **Ficha del paciente**
y **Agenda**, desarrolladas con Ionic y Angular para mostrar en el navegador de la
PC, con un diseño adaptable a pantallas pequeñas. El ajuste actual amplía Inicio
a cuatro indicadores y separa sus datos en un servicio sencillo. La agenda semanal
de ejemplo y la navegación inferior común siguen
disponibles. Los datos del Dashboard, de pacientes y de agenda se consultan mediante
servicios separados de las pantallas.

## Cómo abrirlo

En una terminal de PowerShell, dentro de esta carpeta:

```powershell
npm.cmd install
npm.cmd start
```

La instalación solo es necesaria la primera vez o cuando cambien las dependencias.
Abrí **http://127.0.0.1:4200** en el navegador. Para detener el servidor, presioná
`Ctrl+C` en la terminal. Usamos `npm.cmd` para evitar restricciones de scripts de
PowerShell; no hace falta instalar Angular ni Ionic de forma global.

## Qué incluye este paso

- La ruta `/inicio`, que también se abre al ingresar a la dirección principal.
- La marca PSIQUE y cuatro indicadores: 3 pacientes activos, 8 sesiones de la
  semana, 2 pendientes de cobro y 4 horarios disponibles.
- Cuatro tarjetas de igual altura, en una grilla de 2 × 2 en escritorio y apiladas
  en una columna en pantallas pequeñas, con iconos de personas, calendario, tarjeta
  y reloj de Ionicons.
- El acceso **Ver pacientes**, que lleva a `/pacientes`.
- Un listado de tres pacientes identificados por código, con modalidad y estado
  del tratamiento.
- En cada tarjeta, el horario de la próxima sesión en el sector superior derecho
  cuando está disponible, y la fecha de creación en tamaño pequeño abajo a la derecha.
- El botón **Inicio** para regresar desde Pacientes.
- Tarjetas seleccionables que abren la ficha del paciente, por ejemplo en
  `/pacientes/P-001`.
- Una ficha con código, estado, modalidad, frecuencia, día y horario habitual,
  fecha de inicio del tratamiento, motivo de consulta y Post-it de próxima sesión.
  El Post-it se distingue visualmente con el color terracota de PSIQUE.
- El botón **Pacientes** para regresar desde la ficha y un mensaje
  **Paciente no encontrado** cuando el código de la dirección no existe.
- La ruta `/agenda`, con una semana de ejemplo, selección de día y una lista
  cronológica de sus horarios. Incluye turnos programados, disponibles y un
  ejemplo visual de **Horario liberado**.
- Una barra inferior con **Inicio**, **Pacientes** y **Agenda**, disponible también
  en las fichas, que indica cuál es la sección actual.

Los cuatro indicadores de Inicio son valores fijos de `RESUMEN_DASHBOARD_MOCK`, en
`src/app/data/dashboard.mock.ts`. No se calculan a partir de `PacientesService` ni
de `AgendaService`. El valor de 8 sesiones no representa un cálculo de la semana
de Agenda, que contiene 2 turnos programados. Los 2 pendientes de cobro y los 4
horarios disponibles tampoco provienen de pagos o de un cálculo de disponibilidad.
Los pacientes también son ejemplos, guardados en `PACIENTES_MOCK`, dentro de
`src/app/data/pacientes.mock.ts`:

| Código | Modalidad | Estado | Próxima sesión | Fecha de creación |
| --- | --- | --- | --- | --- |
| P-001 | Presencial | Activo | LUN 15 HS | 01/09/2026 |
| P-002 | Virtual | Activo | MIÉ 10:30 HS | 02/09/2026 |
| P-003 | Presencial | Activo | Sin horario (`null`; no se muestra) | 05/09/2026 |

Los horarios son textos de ejemplo, sin cálculo de fechas ni recurrencia. Las
fechas de creación también son fijas; todavía no hay un formulario que cree
pacientes. La falta de horario no cambia el estado del tratamiento: P-003 sigue
activo aunque no tenga una próxima sesión asignada en este ejemplo.

El archivo de mocks también contiene los datos de la ficha. P-001 tiene frecuencia
semanal, los lunes a las 15:00; P-002, semanal, los miércoles a las 10:30; y P-003,
quincenal, con día y horario habitual en `null`. La ficha presenta estos últimos
como **Sin definir**. Cada paciente tiene su fecha de inicio de tratamiento, motivo
de consulta y Post-it de ejemplo.

Esta versión permite consultar el listado, las fichas y la agenda semanal. Todos
los datos siguen siendo simulados: no hay llamadas HTTP, API, backend, base de datos
ni persistencia. No se incluyen creación, edición, eliminación, historial,
objetivos, pagos o formularios.

## Cómo está organizado

| Archivo | Responsabilidad |
| --- | --- |
| `src/main.ts` | Inicia Angular. |
| `src/app/app.config.ts` | Configura Ionic y el enrutador. |
| `src/app/app.component.ts` | Contenedor de la aplicación: importa los elementos de navegación y define los iconos de la barra inferior. |
| `src/app/app.component.html` | Organiza el área de pantallas y la barra inferior común con enlaces a Inicio, Pacientes y Agenda. |
| `src/app/app.component.scss` | Distribuye el espacio entre pantalla y barra, y define sus estilos y la indicación de sección activa. |
| `src/app/app.routes.ts` | Relaciona `/inicio`, `/pacientes`, `/pacientes/:codigo` y `/agenda` con sus pantallas; redirige la dirección principal a Inicio. |
| `src/app/models/dashboard.ts` | Nuevo: declara `ResumenDashboard`, el contrato con los cuatro indicadores numéricos. |
| `src/app/data/dashboard.mock.ts` | Nuevo: contiene `RESUMEN_DASHBOARD_MOCK`, con los valores fijos 3, 8, 2 y 4. |
| `src/app/services/dashboard.service.ts` | Nuevo: entrega el resumen de ejemplo mediante `obtenerResumen()`. |
| `src/app/inicio/inicio.page.ts` | Obtiene `DashboardService` mediante `inject`, expone `resumen$` y define los iconos. Los valores ya no están escritos dentro del componente. |
| `src/app/inicio/inicio.page.html` | Recibe el resumen con `AsyncPipe` y muestra los cuatro indicadores, sus textos y los accesos existentes. |
| `src/app/inicio/inicio.page.scss` | Conserva la identidad visual de Inicio y distribuye las cuatro tarjetas en una grilla adaptable de igual altura. |
| `src/app/models/paciente.ts` | Declara la interfaz reutilizable `Paciente`, compartida por los mocks, el servicio y las pantallas. |
| `src/app/data/pacientes.mock.ts` | Contiene `PACIENTES_MOCK`, el arreglo de tres pacientes con los datos de ejemplo solicitados. |
| `src/app/services/pacientes.service.ts` | Ofrece consultas de todos los pacientes o de uno por código, usando los mocks. |
| `src/app/pacientes/pacientes.page.ts` | Obtiene el servicio mediante `inject` y expone `pacientes$` para mostrar sus resultados. Ya no contiene el arreglo ni una interfaz local. |
| `src/app/pacientes/pacientes.page.html` | Recibe los datos con `AsyncPipe`, muestra el listado y enlaza cada tarjeta con su ficha. Conserva el regreso a Inicio. |
| `src/app/pacientes/pacientes.page.scss` | Mantiene el estilo visual de PSIQUE y adapta el listado al ancho disponible. |
| `src/app/paciente-detalle/paciente-detalle.page.ts` | Lee el código desde la ruta y consulta el servicio para obtener ese paciente. |
| `src/app/paciente-detalle/paciente-detalle.page.html` | Muestra los datos, el Post-it y el regreso a Pacientes; contempla un código inexistente. |
| `src/app/paciente-detalle/paciente-detalle.page.scss` | Da estilo a la ficha y destaca el Post-it manteniendo colores, tipografía y adaptación de PSIQUE. |
| `src/app/models/turno.ts` | Declara `Turno`, `DiaAgenda` y `SemanaAgenda`, las estructuras de datos de la agenda. |
| `src/app/data/agenda.mock.ts` | Contiene `SEMANA_AGENDA_MOCK`, con los siete días de ejemplo y sus horarios ordenados. |
| `src/app/services/agenda.service.ts` | Entrega la semana de ejemplo mediante `obtenerSemana()`. |
| `src/app/agenda/agenda.page.ts` | Consulta el servicio y conserva el índice del día seleccionado. |
| `src/app/agenda/agenda.page.html` | Muestra la semana, permite seleccionar un día y presenta sus turnos o la ausencia de horarios. |
| `src/app/agenda/agenda.page.scss` | Da estilo a los días y turnos, diferencia sus estados y adapta la pantalla al ancho disponible. |
| `src/global.scss` | Carga los estilos base de Ionic y la tipografía general. |

En este ajuste se agregaron tres archivos: modelo, mock y servicio del Dashboard.
Se modificaron `inicio.page.ts`, `inicio.page.html`, `inicio.page.scss` y esta
documentación. Se conservaron Pacientes, la ficha individual, Agenda y la
navegación inferior. Los iconos utilizan Ionicons, que ya formaba parte del proyecto;
no se agregaron dependencias.

## Cómo obtiene Inicio los indicadores

Se mantienen **Pacientes activos** y **Sesiones de la semana**, y se agregan
**Pendientes de cobro** y **Horarios disponibles**. Los cuatro tienen estos valores
y textos secundarios:

| Indicador | Valor mock | Texto secundario |
| --- | --- | --- |
| Pacientes activos | 3 | Tratamientos en curso |
| Sesiones de la semana | 8 | Actividad semanal del consultorio |
| Pendientes de cobro | 2 | Sesiones pendientes de pago |
| Horarios disponibles | 4 | Disponibles esta semana |

Las tarjetas son indicadores visuales de consulta, sin acciones al seleccionarlas.
Conservan la paleta, los bordes redondeados, la tipografía y el espaciado de Inicio.
En escritorio forman dos filas de dos tarjetas; en pantallas pequeñas se apilan.

La interfaz `ResumenDashboard` describe cuatro propiedades de tipo `number`:
`pacientesActivos`, `sesionesSemana`, `pendientesCobro` y `horariosDisponibles`.
Los valores están en un objeto de ejemplo separado del componente. El flujo es:

```text
Inicio → DashboardService.obtenerResumen() → RESUMEN_DASHBOARD_MOCK
```

`DashboardService` ofrece un único método, `obtenerResumen()`, que devuelve
`Observable<ResumenDashboard>` mediante `of`. Emite el objeto de ejemplo y termina;
no calcula métricas ni hace llamadas HTTP. Inicio obtiene el servicio con `inject`
y expone su resultado en `resumen$`.

En el HTML, `@if (resumen$ | async; as resumen)` recibe el objeto mediante
`AsyncPipe` y lo deja disponible como `resumen` dentro del bloque. Cada tarjeta
muestra su campo con interpolación, por ejemplo `{{ resumen.pendientesCobro }}`.
Las etiquetas y los textos secundarios permanecen en la plantilla, mientras que
los cuatro valores llegan a través del servicio.

Esta separación mantiene a Inicio concentrado en presentar el resumen. Más
adelante, `DashboardService` podrá reemplazar el mock por una consulta a la API
que entregue esos indicadores, conservando los campos de `ResumenDashboard` y
el uso de Observables en la pantalla. La conexión HTTP, los cálculos reales y el
manejo de carga y errores quedan para esa futura integración.

Los tres servicios tienen mocks independientes. El Dashboard no consulta los
servicios de pacientes o agenda ni sincroniza sus valores con ellos. Este ajuste
no implementa cobros, pagos, disponibilidad real, gráficos, nuevos botones ni
otros indicadores.

## Cómo llegan los datos a las pantallas

El flujo actual es:

```text
Listado o ficha → PacientesService → PACIENTES_MOCK
```

`PacientesService` centraliza dos consultas:

| Método | Resultado |
| --- | --- |
| `obtenerPacientes()` | `Observable<Paciente[]>`: emite el arreglo de pacientes de ejemplo. |
| `obtenerPacientePorCodigo(codigo)` | `Observable<Paciente \| undefined>`: emite el paciente cuyo código coincide, o `undefined` si no existe. |

La segunda consulta utiliza `find` para buscar en el arreglo. Ambas usan `of`, de
RxJS, para entregar el resultado como un Observable. En este paso `of` emite el
valor inmediatamente y termina: no simula una demora ni hace una petición de red.

Los componentes solicitan datos al servicio y se ocupan de presentarlos. Ya no
importan directamente el archivo de mocks. Más adelante, el mismo servicio podrá
consultar una API con `HttpClient`, que también devuelve Observables:

```text
Listado o ficha → PacientesService → API/backend
```

Mantener los métodos y la estructura `Paciente` permitirá conservar la presentación
y concentrar el cambio de origen de datos en el servicio. La conexión real requerirá
configurar HTTP y definir cómo manejar carga, errores y respuestas del backend en
esa etapa; esas partes todavía no están implementadas.

## Cómo se abre una ficha

1. Cada tarjeta usa un enlace con `RouterLink` para formar su dirección a partir
   del código: P-001 lleva a `/pacientes/P-001`. `IonRouterLinkWithHref` integra
   ese enlace con la navegación de Ionic.
2. La ruta `pacientes/:codigo` identifica `codigo` como un parámetro variable y
   carga el componente de detalle.
3. La ficha recibe ese parámetro mediante `ActivatedRoute.paramMap` y lo utiliza
   para llamar a `obtenerPacientePorCodigo` del servicio.
4. El HTML recibe el resultado mediante `AsyncPipe`. Si existe el paciente,
   muestra la ficha; si no existe, muestra **Paciente no encontrado**.
5. `IonBackButton` permite regresar al listado. Su `defaultHref="/pacientes"`
   mantiene ese regreso disponible incluso al abrir la URL de una ficha directamente.

## Cómo funciona Agenda

Agenda muestra la semana fija del **7 al 13 de septiembre de 2026**. Se utiliza una
semana explícita de ejemplo; no se calcula la semana actual ni se generan turnos
recurrentes a partir de los pacientes.

| Día | Horarios del ejemplo, en orden |
| --- | --- |
| Lunes 7 | 09:00 Disponible; 11:00 Horario liberado; 15:00 P-001, Presencial, Programado. |
| Martes 8 | 09:00, 11:00 y 15:00 Disponibles. |
| Miércoles 9 | 09:00 Disponible; 10:30 P-002, Virtual, Programado; 12:00 Disponible. |
| Jueves 10 | 09:00 y 11:00 Disponibles. |
| Viernes 11 | 09:00, 11:00 y 15:00 Disponibles. |
| Sábado 12 | Sin horarios cargados. |
| Domingo 13 | Sin horarios cargados. |

P-001 y P-002 conservan los días, horas y modalidades de sus fichas. P-003 sigue
sin horario asignado. Esta coincidencia está escrita en los mocks; todavía no hay
sincronización automática entre los servicios de pacientes y agenda.

### Modelos de la agenda

Las tres interfaces están en `models/turno.ts`:

| Interfaz | Responsabilidad |
| --- | --- |
| `Turno` | Representa un horario y, cuando corresponde, su paciente y modalidad. |
| `DiaAgenda` | Agrupa `fecha` en formato `YYYY-MM-DD`, `nombre` del día y `turnos`, un arreglo de `Turno`. |
| `SemanaAgenda` | Agrupa `titulo` de la semana y `dias`, un arreglo de `DiaAgenda`. |

Cada `Turno` contiene únicamente estos campos:

| Campo | Tipo y significado |
| --- | --- |
| `horario` | `string`, en formato `HH:mm`, como `10:30`. |
| `codigoPaciente` | `string` o `null`; usa códigos como `P-002`, sin nombres reales. |
| `modalidad` | `Presencial`, `Virtual` o `null`. Los horarios sin paciente no necesitan modalidad. |
| `estado` | `Programado`, `Disponible` o `Liberado`. |

Los turnos ya están ordenados cronológicamente en `agenda.mock.ts`. La pantalla
los presenta en ese orden; no hay un motor que calcule disponibilidad. Los días
sin horarios tienen un arreglo `turnos: []`. El bloque `@empty` de la plantilla
muestra **Sin horarios cargados para este día.** cuando ese arreglo está vacío.

### Servicio y selección del día

El flujo de datos es:

```text
Agenda → AgendaService.obtenerSemana() → SEMANA_AGENDA_MOCK
```

`AgendaService` está disponible mediante `providedIn: 'root'`. Su método
`obtenerSemana()` devuelve `Observable<SemanaAgenda>` usando `of`: emite la semana
completa de ejemplo y termina, sin hacer llamadas HTTP. La pantalla obtiene el
servicio con `inject`, expone el resultado en `semana$` y lo recibe en el HTML con
`AsyncPipe`, igual que las pantallas de pacientes.

`indiceDiaSeleccionado` guarda una posición del arreglo `dias`. Comienza en `0`,
que corresponde al lunes. Al presionar otro día, `seleccionarDia(indice)` cambia
esa propiedad. Angular actualiza el día resaltado y muestra los turnos de
`semana.dias[indiceDiaSeleccionado]`.

En el HTML, `(click)="seleccionarDia(indice)"` conecta el botón con el método.
`[class.seleccionado]` depende de la comparación entre el índice del botón y el
índice elegido. `DatePipe` presenta la fecha como número de día en el selector
y como `dd/MM/yyyy` junto al nombre del día seleccionado.

El índice es **estado de la interfaz**: indica qué parte de los datos se está
mirando. Cambiarlo no modifica los turnos, no realiza otra consulta al servicio
ni guarda la selección en una base de datos.

El servicio concentra el origen de los datos. En una futura integración podrá
reemplazar el acceso al mock por una consulta a una API, manteniendo el contrato
de `SemanaAgenda` y el uso de Observables en la pantalla. Configurar `HttpClient`
y manejar la carga, errores y respuestas reales quedará para esa etapa.

### Alcance de esta agenda

**Horario liberado** es una etiqueta de ejemplo sobre el lunes a las 11:00.
Representa visualmente un horario que quedó disponible; no es el resultado de
cancelar un turno desde la aplicación.

Todavía no están implementados cambio de semana, calendario mensual, feriados,
creación o edición de turnos, cancelaciones reales, recurrencias, cálculo de
disponibilidad, notificaciones, alertas, lista de espera o reasignación automática.
Tampoco se incorporaron autenticación, API, backend o persistencia. Con Agenda y la
navegación queda completo el alcance solicitado para esta etapa del prototipo.

## Cómo funciona la navegación inferior

La barra vive en `app.component.html`, fuera de `ion-router-outlet`, por lo que
permanece visible al cambiar de pantalla. Contiene únicamente enlaces a **Inicio**,
**Pacientes** y **Agenda**. El contenedor de pantallas y la barra ocupan espacios
propios en la distribución; la barra no se superpone al contenido y contempla el
espacio seguro inferior del dispositivo.

Los enlaces combinan `RouterLink` con `IonRouterLinkWithHref`, como las tarjetas
del listado. `routerDirection="root"` indica a Ionic que el destino es una sección
principal de la navegación. Los botones de regreso de Pacientes y de la ficha
siguen disponibles para el recorrido **Inicio → Pacientes → Ficha**.

`RouterLinkActive` aplica el estilo de sección activa según la URL.
**Inicio** exige una coincidencia exacta con `/inicio`; **Pacientes** también queda
activo en `/pacientes/P-001` y las demás fichas, porque pertenecen a esa sección.
`ariaCurrentWhenActive="page"` comunica la opción actual a las herramientas de
accesibilidad.

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
| `prerendered-routes.json` | Registro generado de rutas prerenderizadas. Actualmente contiene `"routes": {}`, sin páginas prerenderizadas; su existencia no significa que haya un backend. |

Los archivos de `www` no se editan a mano: una nueva compilación puede
reemplazarlos. Para cambiar una pantalla, modificamos `src` y volvemos a compilar
si necesitamos actualizar la versión de producción.

`npm.cmd start` trabaja con el código fuente y recompila los cambios mediante el
servidor de desarrollo; no depende de una compilación previa en `www`. Para mostrar
los archivos de producción se debe servir `www/browser` mediante un servidor web,
con redirección a `index.html` para rutas como `/pacientes`. No se debe abrir
`www/browser/index.html` con doble clic (`file://`), porque la aplicación necesita
cargarse por HTTP y resolver correctamente sus rutas y módulos.

## Conceptos para explicar

Un **componente** reúne datos, estructura y estilos de una parte de la interfaz.
En Inicio, Angular reemplaza `{{ resumen.pacientesActivos }}` por el valor de esa
propiedad del resumen recibido desde el servicio. Esto se llama **interpolación**.

La **interfaz `ResumenDashboard`** describe los cuatro valores numéricos que Inicio
necesita mostrar. Ayuda a comprobar que el mock y el servicio respeten la misma
estructura; no calcula esos indicadores. Separar modelo, datos, servicio y pantalla
permite explicar dónde se define cada responsabilidad y cambiar posteriormente
el origen de los datos en `DashboardService`.

El **enrutador** elige la pantalla según la dirección del navegador. Al abrir `/`,
redirige a `/inicio`; `ion-router-outlet` es el lugar donde se muestra esa pantalla.
`RouterLink` permite ir a `/pacientes` desde **Ver pacientes** sin recargar toda
la aplicación. Las rutas usan `loadComponent` para cargar cada pantalla cuando
se necesita.

En Pacientes, `IonBackButton` utiliza la navegación de Ionic para volver a la
pantalla anterior. Su `defaultHref="/inicio"` permite regresar también cuando
entramos directamente a `/pacientes` y no hay una pantalla anterior en esa navegación.

La **interfaz `Paciente`** es un contrato de tipos reutilizable. Describe código,
modalidad, estado, próxima sesión, frecuencia, día y horario habitual, fecha de
creación, fecha de inicio del tratamiento, motivo de consulta y Post-it. Ayuda a
comprobar que mocks, servicio y pantallas usen una estructura compatible. No crea
una tabla ni guarda información, y tampoco valida por sí sola una futura respuesta
HTTP en tiempo de ejecución.

Un **servicio** reúne una responsabilidad que pueden usar distintas pantallas.
`PacientesService` concentra el acceso a los pacientes. `providedIn: 'root'` lo
deja disponible para toda la aplicación y `inject(PacientesService)` permite que
Angular entregue esa dependencia al componente, sin crearla manualmente con `new`.

Un **Observable** representa una fuente que puede entregar valores a quien se
suscriba. En los servicios de Dashboard, pacientes y agenda, `of` entrega los mocks
y finaliza. El sufijo `$` en `resumen$`, `pacientes$`, `paciente$` o `semana$` es una
convención para reconocer propiedades que contienen Observables; no es una sintaxis
especial de Angular.

**`AsyncPipe`**, usado como `| async` en el HTML, se suscribe al Observable y entrega
su último resultado a la plantilla. Administra esa suscripción y la libera cuando
el componente se destruye o cambia el Observable. Así las pantallas no necesitan
escribir un `subscribe` manual para mostrar los datos.

**`ActivatedRoute.paramMap`** entrega los parámetros de la ruta y sus cambios.
`parametros.get('codigo')` obtiene, por ejemplo, `P-001`. El operador **`switchMap`**
convierte cada código en la consulta al servicio y entrega el resultado de la
consulta vigente. Si cambia el código, deja de escuchar la consulta anterior y
escucha la nueva; también contempla el caso en que Angular reutilice el componente
para otra ficha. La búsqueda concreta sigue estando en el servicio, mediante `find`.

El bloque **`@for`** del listado recorre el arreglo obtenido con `AsyncPipe` y
repite la presentación de cada paciente. `track paciente.codigo` le da a Angular
una identificación estable para cada elemento. En la ficha, **`@if`** permite
mostrar los datos cuando el servicio encontró el paciente y un mensaje cuando
devolvió `undefined`.

`proximaSesion` tiene el tipo `string | null`: puede contener una etiqueta de
horario o representar su ausencia. El bloque `@if` muestra el horario únicamente
cuando hay un valor; si es `null`, deja ese sector sin texto. Esta condición no
deduce el estado del paciente ni la razón por la que no tiene una próxima sesión.

`fechaCreacion` y `fechaInicioTratamiento` se guardan como texto con formato
`YYYY-MM-DD`. En el HTML, **`DatePipe`** aplica `date: 'dd/MM/yyyy'` para presentar,
por ejemplo, `2026-09-01` como `01/09/2026`. El pipe transforma la presentación,
sin modificar el valor original ni generar automáticamente una fecha.

El día y el horario habitual también admiten `null`. La ficha usa **`??`** para
mostrar **Sin definir** cuando falta alguno; este operador elige el texto alternativo
solo si el valor es `null` o `undefined`.

Los componentes son **standalone**: cada uno declara los elementos de Angular o
Ionic que necesita en su lista `imports`.

La regla `@media` en SCSS adapta las tarjetas al ancho disponible. El contenido
es el mismo en PC y en un navegador estrecho.

## Verificación y demo

```powershell
npm.cmd run build
```

Este comando comprueba la compilación y genera la versión de producción en `www/`.
Para una demo en clase, iniciá el servidor con `npm.cmd start`, abrí el navegador
y ajustá el zoom para que los textos se vean bien en el proyector.

Para probar el Dashboard:

1. Abrí `http://127.0.0.1:4200/inicio` y comprobá los cuatro indicadores y sus
   valores: **Pacientes activos: 3**, **Sesiones de la semana: 8**, **Pendientes de
   cobro: 2** y **Horarios disponibles: 4**. Revisá los textos secundarios de la
   tabla del Dashboard y sus iconos de personas, calendario, tarjeta y reloj.
2. En una ventana de escritorio, comprobá una grilla de 2 × 2 con tarjetas de igual
   altura. Reducí el ancho para comprobar que se apilen en una columna, sin cortar
   los títulos o las descripciones ni ocultar el contenido bajo la barra inferior.
3. Recargá `/inicio`: deben seguir apareciendo los cuatro valores. Cambiá de día en
   Agenda y regresá a Inicio; el resumen debe conservar 3, 8, 2 y 4, porque sus datos
   mock son independientes.
4. Probá **Ver pacientes** y la barra inferior para confirmar que siguen disponibles
   los recorridos existentes de pacientes, ficha y agenda descritos a continuación.

Para comprobar el recorrido existente de pacientes:

1. Abrí `/inicio` y comprobá que se vea el Dashboard de cuatro indicadores.
2. Presioná **Ver pacientes**: la dirección debe cambiar a `/pacientes` y aparecer
   los tres códigos, sus modalidades y sus estados.
3. Comprobá los horarios de P-001 y P-002 arriba a la derecha, y las tres fechas
   de creación abajo a la derecha. P-003 debe conservar su estado Activo y dejar
   el sector del horario vacío.
4. Seleccioná P-001: debe abrirse `/pacientes/P-001`. Comprobá su estado Activo,
   modalidad Presencial, frecuencia Semanal, lunes a las 15:00, inicio 01/09/2026,
   motivo de consulta y Post-it. El Post-it debe distinguirse del resto de la ficha.
5. Volvé con **Pacientes** y abrí P-002. Comprobá que cambien los datos: modalidad
   Virtual, miércoles a las 10:30 y los textos correspondientes a ese paciente.
6. Abrí P-003: debe mostrar frecuencia Quincenal y **Sin definir** para el día y
   horario habitual, conservando el estado Activo.
7. Abrí directamente `http://127.0.0.1:4200/pacientes/P-002` en una pestaña nueva,
   recargá y comprobá que la ficha y el regreso a Pacientes sigan funcionando.
8. Visitá `http://127.0.0.1:4200/pacientes/P-999`: debe aparecer
   **Paciente no encontrado**, con el regreso a Pacientes disponible.
9. Desde el listado, usá **Inicio** y repetí el recorrido. Reducí el ancho de la
   ventana para revisar que listado, ficha, Post-it, textos y botones se adapten.

Para probar Agenda y la barra inferior:

1. Desde Inicio, seleccioná **Agenda** en la barra. La URL debe cambiar a `/agenda`,
   la opción Agenda debe quedar activa y debe aparecer la semana del 7 al 13 de
   septiembre de 2026, con el lunes seleccionado inicialmente.
2. Comprobá los horarios del lunes en orden: 09:00 Disponible, 11:00 **Horario
   liberado** y 15:00 P-001, Presencial, Programado. La etiqueta de horario liberado
   debe distinguirse visualmente y no ofrecer una cancelación o reasignación real.
3. Seleccioná el miércoles y comprobá P-002, Virtual, a las 10:30. Cambiá a martes,
   jueves y viernes: deben verse los horarios disponibles indicados en la tabla
   de esta documentación. El día resaltado y la lista deben cambiar juntos.
4. Seleccioná sábado y domingo: debe mostrarse que no hay horarios cargados. Volvé
   al lunes y comprobá que sigan los mismos tres horarios. P-003 no debe aparecer
   asignado a un turno de esta semana.
5. Usá la barra para ir a **Pacientes**, abrí una ficha y comprobá que la sección
   Pacientes siga activa. Probá el regreso desde la ficha, el acceso a **Inicio**
   y el regreso a **Agenda** mediante la barra.
6. Abrí directamente `http://127.0.0.1:4200/agenda` en una pestaña nueva y recargá.
   Debe aparecer la agenda con el lunes seleccionado y la barra operativa.
7. Probá una ventana estrecha y otra amplia. Revisá los siete días, la legibilidad
   de horarios y estados, y que puedas llegar al final del contenido sin que la
   barra inferior lo tape. Con `Tab` y `Enter`, probá los enlaces de navegación y
   los botones de selección de día.

Para relacionar la demo con el código, ubicá primero los registros en
`pacientes.mock.ts`, después las consultas de `PacientesService` y finalmente
las propiedades con Observables de cada pantalla. Ese recorrido permite explicar
qué datos son de ejemplo y cómo cada pantalla recibe únicamente lo que necesita.
Repetí el recorrido con `agenda.mock.ts`, `AgendaService` y `semana$`: al elegir
otro día cambia el índice de selección en la pantalla, mientras los datos de la
semana permanecen iguales.
En Inicio, seguí `dashboard.mock.ts` → `DashboardService` → `resumen$` →
`AsyncPipe` → las cuatro tarjetas. Para la defensa oral, distinguí entre presentar
un número mock y calcular una métrica real: en esta versión se implementa la
presentación y se prepara el punto donde podrá cambiar el origen de los datos.
