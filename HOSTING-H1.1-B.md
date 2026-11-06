# PSIQUE — H1.1-B: dependencias del frontend

Fecha: **06/11/2026**. Repositorio: **APP-PSIQUE**. Se completaron las correcciones
compatibles y las comprobaciones locales; permanecen 16 avisos moderados de
herramientas. No se presenta la auditoría como totalmente resuelta ni como una
auditoría completa de seguridad. No se avanzó al cierre H1.1-C ni al hosting.

## Estado de partida y alcance

Rama main, HEAD `099906eb81157bf906fa471030e2b202d8a0d526`. Ya existían cambios en
backend/package-lock.json y dos archivos sin seguimiento: backend/test/fixtures/servidor-json.mjs
y backend/test/seguridad-json.test.mjs. Se conservaron sus bytes. No se ejecutaron
instalaciones ni nuevas suites sobre el backend, cuya verificación H1.1-A permanece
como antecedente: 88 pruebas habituales, 108 PostgreSQL y auditorías sin avisos.

H1 había registrado 34 paquetes afectados en la raíz. La consulta nueva, con el
lock original intacto, informó 33. La diferencia corresponde al resultado actual
del catálogo consultado; no se atribuye a una corrección todavía no aplicada.

## Cambios de versiones y resolución

| Dependencia directa | Antes | Después |
| --- | --- | --- |
| @angular/common | 21.2.22 | 21.2.26 |
| @angular/compiler | 21.2.22 | 21.2.26 |
| @angular/core | 21.2.22 | 21.2.26 |
| @angular/forms | 21.2.22 | 21.2.26 |
| @angular/platform-browser | 21.2.22 | 21.2.26 |
| @angular/router | 21.2.22 | 21.2.26 |
| @angular/compiler-cli | 21.2.22 | 21.2.26 |
| @angular/cli | 21.2.23 | 21.2.29 |
| @angular/build | 21.2.23 | 21.2.29 |

Se mantienen Ionic Angular 9.0.2, Capacitor core/android/CLI 8.6.0, plugin App
8.1.2, TypeScript 5.9.3, RxJS 7.8.2, Zone.js 0.15.1, Ionicons 8.1.0 y tslib 2.8.1.
El runtime/compilador Angular usa 21.2.26 y CLI/build 21.2.29: son series de
publicación distintas, con peers compatibles verificados. Node usado: 24.14.1;
npm: 11.11.0. Los rangos Angular quedaron limitados a parches de 21.2 mediante ~.
Ver [compatibilidad oficial](https://angular.dev/reference/versions) y
[CLI 21.2.29](https://github.com/angular/angular-cli/releases/tag/v21.2.29).

La resolución inicial sobre el lock antiguo dio ERESOLVE. Se reconstruyó el
lock mediante npm en una copia aislada, manteniendo temporalmente fijas las
versiones directas ajenas a Angular y restituyendo luego sus rangos originales.
También se renovaron sus dependencias transitivas dentro de los rangos admitidos,
incluido rimraf 6.1.4, cuya rama glob/minimatch ya queda corregida. No se editó el
lock a mano ni se usaron force, legacy-peer-deps, overrides o audit fix.
La instalación limpia y npm ls --all terminaron sin conflictos.

Solo se cambian package.json y package-lock.json de la raíz, además de este
informe. No hay cambios en pantallas, estilos, servicios, guards, interceptor,
entornos, scripts de build, configuración Ionic/Angular/Capacitor o archivos nativos.

## Clasificación y aplicabilidad

- **A, navegador:** Angular Router sí forma parte del bundle. Core, Common,
  Forms, HttpClient dentro de Common, Ionic y RxJS no tenían avisos propios en
  esta consulta. Se actualizó Angular coordinadamente para respetar sus peers.
- **C, función no utilizada:** los tres avisos de Router eran DoS bajo SSR.
  angular.json solo tiene build de aplicación browser y servidor de desarrollo;
  main.ts usa bootstrapApplication y no hay entrada servidor ni configuración
  SSR/prerender. La dependencia browser no se confundió con un servidor SSR.
  Router 21.2.26 supera los parches señalados 21.2.24/21.2.25.
- **B, herramientas:** Piscina, Vite, Undici, CLI/MCP, sus servidores auxiliares,
  validadores y utilidades de filesystem pertenecen al desarrollo/compilación.
  Los avisos críticos/altos se corrigieron con los parches y la resolución normal.
  No se descartaron por estar marcados dev.

| Paquetes con avisos propios | Condición técnica y alcance en esta app | Corrección obtenida |
| --- | --- | --- |
| Router | Las rutas y enlaces deben procesarse mediante SSR para los tres DoS señalados. PSIQUE es una SPA. | 21.2.26, coordinado con los demás paquetes Angular. |
| Piscina | Opciones del pool manipulables mediante contaminación de prototipos; riesgo en el proceso de build, sin entrada clínica identificada hacia esas opciones. | 5.3.2, fijado por Angular Build. |
| Vite | Condiciones de servidor de desarrollo, acceso a archivos y apertura de editor; npm start sigue ligado a 127.0.0.1. No se publica Vite como servidor. | 7.3.7. |
| Undici | Condiciones particulares de clientes HTTP: decompression, WebSocket, cachés, redirects o TLS. Se usa en herramientas, sin añadirlo al bundle browser ni cambiar fetch del backend. | 7.30.1 y 6.29.1 en sus dos ramas. |
| MCP SDK | Transporte HTTP, autenticación, OAuth y validación del servidor/cliente MCP. PSIQUE no inicia ng mcp ni usa esa función para servir la app. | 1.32.1. |
| proxy-addr, body-parser, qs | Funciones de servidores Node auxiliares del CLI; trust proxy, cuerpos comprimidos o serialización comma de datos manipulables. No es la instalación Express de backend/. | 2.0.8, 2.4.0 y 6.17.1. |
| Hono y @hono/node-server | Servir rutas estáticas con una segunda decodificación del path. No hay servidor Hono de PSIQUE. | 4.13.16 y 2.1.6. |
| Zod | Colecciones controlables y costosas de validar en herramientas. | 4.6.6. |
| fast-uri | Normalización/comparación insegura de referencias URI bajo las condiciones de sus avisos; dependencia de validación de esquemas del CLI. | 3.1.9. |
| ip-address | Comparaciones de familias IP, diagnósticos de parseo o patrones bajo las condiciones de sus avisos. Herramientas de red/CLI. | 10.7.6. |
| brace-expansion | Patrones o grupos profundamente anidados/controlables que agotan CPU o pila. Procesamiento de patrones en herramientas. | 5.0.12. |
| source-map-js | Mapas indexados con offsets manipulables que ocasionan trabajo excesivo. Herramientas de compilación. | 1.2.2. |
| glob y minimatch | Trabajo de filesystem que continúa tras abortar; o patrones manipulables con optimizationLevel >= 2. Herramientas; quedan ramas pendientes descritas abajo. | Rama rimraf corregida; otras ramas siguen fuera de los rangos de los parches disponibles. |

Las condiciones son una evaluación de aplicabilidad, no pruebas de explotación.
No se ejecutaron pruebas especiales de ataques ni se atribuyen todos los avisos
de herramientas al sitio estático publicado.

## Inventario de paquetes inicialmente afectados

Cada fila identifica versión, procedencia, severidad y avisos propios o propagados.
Las versiones después incluyen las ramas duplicadas que permanecen en el árbol.
Las condiciones y la acción para cada familia están en la tabla anterior; en las
filas propagadas se aplica la condición de su dependencia causante.

| Paquete y grupo | Versiones antes → después | Severidad antes → después | Cadena que lo introduce | Identificadores o propagación |
| --- | --- | --- | --- | --- |
| @angular/build (B) | 21.2.23 → 21.2.29 | Crítica → sin aviso | @angular/build | Heredado de piscina, undici, vite |
| @angular/cli (B) | 21.2.23 → 21.2.29 | Alta → Moderada | @angular/cli | Heredado de @modelcontextprotocol/sdk, pacote, zod |
| @angular/router (A/C) | 21.2.22 → 21.2.26 | Alta → sin aviso | @angular/router | [GHSA-ff3f-86qr-9cv3](https://github.com/advisories/GHSA-ff3f-86qr-9cv3); [GHSA-62vg-58rm-qff7](https://github.com/advisories/GHSA-62vg-58rm-qff7); [GHSA-57xq-rjx2-v5xh](https://github.com/advisories/GHSA-57xq-rjx2-v5xh) |
| @hono/node-server (B) | 2.1.1 → 2.1.6 | Moderada → sin aviso | @angular/cli → @modelcontextprotocol/sdk → @hono/node-server | [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) |
| @modelcontextprotocol/sdk (B) | 1.30.0 → 1.32.1 | Alta → sin aviso | @angular/cli → @modelcontextprotocol/sdk | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h); [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw); [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453); [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq); [GHSA-f897-62hf-6gxq](https://github.com/advisories/GHSA-f897-62hf-6gxq); [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw) |
| @npmcli/package-json (B) | 7.0.5 → 7.0.5 | Moderada → Moderada | @angular/cli → pacote → @npmcli/package-json | Heredado de glob |
| @npmcli/run-script (B) | 10.0.4 → 10.0.4 | Moderada → Moderada | @angular/cli → pacote → @npmcli/run-script | Heredado de @npmcli/package-json |
| @sigstore/sign (B) | 4.1.1 → 4.1.1 | Moderada → Moderada | @angular/cli → pacote → sigstore → @sigstore/sign | Heredado de make-fetch-happen |
| @sigstore/tuf (B) | 4.0.2 → 4.0.2 | Moderada → Moderada | @angular/cli → pacote → sigstore → @sigstore/tuf | Heredado de tuf-js |
| @tufjs/models (B) | 4.1.0 → 4.1.0 | Moderada → Moderada | @angular/cli → pacote → sigstore → @sigstore/tuf → tuf-js → @tufjs/models | Heredado de minimatch |
| body-parser (B) | 2.3.0 → 2.4.0 | Alta → sin aviso | @angular/cli → @modelcontextprotocol/sdk → express → body-parser | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) |
| brace-expansion (B) | 5.0.9 → 5.0.12 | Alta → sin aviso | @capacitor/cli → rimraf → glob → minimatch → brace-expansion | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr); [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7); [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| cacache (B) | 20.0.4 → 20.0.4 | Moderada → Moderada | @angular/cli → pacote → cacache | Heredado de glob |
| fast-uri (B) | 3.1.7 → 3.1.9 | Moderada → sin aviso | @angular/cli → @angular-devkit/core → ajv → fast-uri | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj); [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg); [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h); [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr); [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) |
| glob (B) | 13.0.6 → 13.0.7, 14.0.4 | Moderada → Moderada | @capacitor/cli → rimraf → glob | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4); Heredado de minimatch |
| hono (B) | 4.13.7 → 4.13.16 | Moderada → sin aviso | @angular/cli → @modelcontextprotocol/sdk → hono | [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) |
| ignore-walk (B) | 8.0.0 → 8.0.0 | Moderada → Moderada | @angular/cli → pacote → npm-packlist → ignore-walk | Heredado de minimatch |
| ip-address (B) | 10.7.0 → 10.7.6 | Moderada → sin aviso | @angular/cli → @modelcontextprotocol/sdk → express-rate-limit → ip-address | [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv); [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw); [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) |
| make-fetch-happen (B) | 15.0.6 → 15.0.6 | Moderada → Moderada | @angular/cli → pacote → npm-registry-fetch → make-fetch-happen | Heredado de cacache |
| minimatch (B) | 10.2.6 → 10.2.6, 11.0.5 | Moderada → Moderada | @capacitor/cli → rimraf → glob → minimatch | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| npm-packlist (B) | 10.0.4 → 10.0.4 | Moderada → Moderada | @angular/cli → pacote → npm-packlist | Heredado de ignore-walk |
| npm-registry-fetch (B) | 19.1.1 → 19.1.1 | Moderada → Moderada | @angular/cli → pacote → npm-registry-fetch | Heredado de make-fetch-happen |
| pacote (B) | 21.5.1 → 21.5.1 | Moderada → Moderada | @angular/cli → pacote | Heredado de @npmcli/package-json, @npmcli/run-script, cacache, npm-packlist, npm-registry-fetch, sigstore |
| piscina (B) | 5.2.0 → 5.3.2 | Crítica → sin aviso | @angular/build → piscina | [GHSA-67c8-pqhq-4rmx](https://github.com/advisories/GHSA-67c8-pqhq-4rmx) |
| proxy-addr (B) | 2.0.7 → 2.0.8 | Crítica → sin aviso | @angular/cli → @modelcontextprotocol/sdk → express → proxy-addr | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| qs (B) | 6.16.0 → 6.17.1 | Moderada → sin aviso | @angular/cli → @modelcontextprotocol/sdk → express → qs | [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) |
| rimraf (B) | 6.1.3 → 6.1.4 | Moderada → sin aviso | @capacitor/cli → rimraf | Heredado de glob |
| sigstore (B) | 4.1.1 → 4.1.1 | Moderada → Moderada | @angular/cli → pacote → sigstore | Heredado de @sigstore/sign, @sigstore/tuf |
| source-map-js (B) | 1.2.1 → 1.2.2 | Alta → sin aviso | @angular/build → sass → source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| tuf-js (B) | 4.1.0 → 4.1.0 | Moderada → Moderada | @angular/cli → pacote → sigstore → @sigstore/tuf → tuf-js | Heredado de @tufjs/models, make-fetch-happen |
| undici (B) | 6.28.1, 7.29.0 → 6.29.1, 7.30.1 | Alta → sin aviso | @angular/build → undici | [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v); [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x); [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r); [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5); [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm); [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j); [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968); [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3); [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv); [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq); [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685); [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472); [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c); [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26); [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx); [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm); [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6); [GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6) |
| vite (B) | 7.3.6 → 7.3.7 | Alta → sin aviso | @angular/build → vite | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv); [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw); [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm); [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw); [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) |
| zod (B) | 4.3.6 → 4.6.6 | Alta → sin aviso | @angular/cli → zod | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

## Auditoría posterior y riesgos pendientes

| Severidad | H1 histórico | Inicio de H1.1-B | Final de H1.1-B |
| --- | ---: | ---: | ---: |
| Crítica | 3 | 3 | 0 |
| Alta | 9 | 9 | 0 |
| Moderada | 22 | 21 | 16 |
| Baja | 0 | 0 | 0 |
| Total de paquetes afectados | 34 | 33 | 16 |

npm audit --omit=dev pasó de un paquete alto (Router) a **cero avisos**.
Los 16 paquetes restantes están marcados dev y propagan **dos avisos subyacentes**:

1. glob 13.0.7: [GHSA-3g3m-2fjr-6pw4](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4).
   Corrección publicada desde 14.0.2. @npmcli/package-json 7.0.5 y cacache 20.0.4
   requieren glob ^13.0.0, por la cadena pacote 21.5.1 del CLI.
2. minimatch 10.2.6: [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
   Corregido en 11.0.1; glob 13 admite minimatch ^10.2.2 y ignore-walk también
   mantiene la rama 10. La consulta de versiones confirmó que no hay un parche
   posterior corregido en esas ramas 13/10.

No se fuerzan glob 14/minimatch 11 por fuera del contrato de sus consumidores.
npm propone en este árbol cambiar Angular CLI a 16.2.16: ese cambio mayor y
retroceso queda fuera del alcance y no se aplica. No significa que Angular 16
sea una recomendación para PSIQUE. La rama de rimraf, que sí admite glob ^14.0.3,
resolvió normalmente glob 14.0.4 y minimatch 11.0.5 sin overrides.

| Paquete todavía señalado | Versiones en el árbol | Causa o propagación |
| --- | --- | --- |
| @angular/cli | 21.2.29 | pacote |
| @npmcli/package-json | 7.0.5 | glob |
| @npmcli/run-script | 10.0.4 | @npmcli/package-json |
| @sigstore/sign | 4.1.1 | make-fetch-happen |
| @sigstore/tuf | 4.0.2 | tuf-js |
| @tufjs/models | 4.1.0 | minimatch |
| cacache | 20.0.4 | glob |
| glob | 13.0.7, 14.0.4 | minimatch |
| ignore-walk | 8.0.0 | minimatch |
| make-fetch-happen | 15.0.6 | cacache |
| minimatch | 10.2.6, 11.0.5 | Aviso propio |
| npm-packlist | 10.0.4 | ignore-walk |
| npm-registry-fetch | 19.1.1 | make-fetch-happen |
| pacote | 21.5.1 | @npmcli/package-json, @npmcli/run-script, cacache, npm-packlist, npm-registry-fetch, sigstore |
| sigstore | 4.1.1 | @sigstore/sign, @sigstore/tuf |
| tuf-js | 4.1.0 | @tufjs/models, make-fetch-happen |

El riesgo residual es trabajo excesivo de CPU/I/O al procesar archivos o patrones
manipulables en herramientas. No se identificó una ruta desde formularios o datos
de pacientes a esas funciones. No equivale a ausencia de riesgo en desarrollo o
cadena de suministro: usar fuentes y dependencias confiables, no exponer el
servidor de desarrollo y revisar nuevos parches del CLI y sus consumidores.
La solución preferida es una actualización compatible de esos consumidores;
un override con salto mayor necesitaría una revisión de compatibilidad específica.

## Comprobaciones reales

Todas las instalaciones, compilaciones y pruebas se ejecutaron en la copia
aislada, sin .env ni credenciales y sin borrar el node_modules habitual.

| Comprobación | Resultado |
| --- | --- |
| npm ci --include=dev --no-audit --no-fund | Correcto: 502 paquetes instalados desde cero. |
| npm ls --all | Código 0; sin conflictos de peers. |
| npm run test:config | 37 resultados aprobados, cero fallos u omitidos. |
| Guards originales con inyector Angular | Cuatro comprobaciones adicionales aprobadas: acceso privado/público con y sin token. No se modificaron tests versionados. |
| npm run build -- --stats-json | Correcto, entorno local y salida www/browser. |
| npm run build:production | Correcto con https://api.example.test/api, dominio reservado no consultado. |
| Bundle de producción | 54 archivos bajo browser; contiene la URL reservada, sin la API local ni coincidencias con los cinco secretos locales contrastados en memoria. |
| npm run build -- --configuration android-local | Correcto en la copia; no se ejecutó sync ni Gradle. |
| cap ls android | Correcto; detecta @capacitor/app 8.1.2. |

La suite existente cubre formularios de cuenta, validaciones, confirmación y
recuperación, interceptor JWT local/producción/Android, borradores, errores,
Dashboard, pacientes, agendamiento, Notas, sesiones, histórico, cobros, duración,
calendario y navegación asociada. El build compila las plantillas y rutas de
todas las pantallas. No se repitió una demo visual completa ni una integración
HTTP real; los servicios de estos tests están controlados. No se enviaron emails.

Las estadísticas del build local registran 605 inputs e incluyen Router e Ionic;
no incluyen glob, minimatch, Piscina, Vite, Angular CLI, MCP ni proxy-addr. El
único reemplazo de producción es el entorno de URL, sin añadir imports de estas
herramientas. Esa revisión del grafo y de la configuración complementa a omit=dev;
el mero campo dev del lockfile no se utilizó como prueba de contenido del bundle.

## Android, conservación y límites

Capacitor 8.6.0 y el plugin App 8.1.2 se conservan. Los peers de Ionic 9.0.2
admiten Angular >=18 y RxJS >=7.5, satisfechos por Angular 21.2.26/RxJS 7.8.2.
Standalone, IonicRouteStrategy, ion-router-outlet y el manejador de Atrás conservan
su implementación. Se comprobó la configuración del plugin y la compilación,
no una ejecución nueva del botón físico en un APK recompilado.

webDir sigue siendo www/browser. capacitor.config.ts, android-local, scripts de
preparación, validación HTTPS, manifest, Gradle, AGP, JDK y código nativo permanecen
idénticos. No se generó un APK remoto ni se sobrescribió el debug anterior.
El APK comprobado conserva las bibliotecas anteriores: para incorporar estas
versiones hará falta compilar e instalar otra copia y repetir el recorrido Android
en una etapa posterior autorizada. Los enlaces de correo mantienen su flujo web.

El node_modules y www habituales no se reemplazaron: las bibliotecas nuevas se
instalaron y ejecutaron en la copia de verificación. Antes de usar estas versiones
en el entorno habitual deberá instalarse el lock actualizado; un clon o el futuro
build remoto lo reproduce con npm ci. No se atribuyen las versiones nuevas al APK
ni a una instalación habitual todavía no actualizada.

No se modificó ningún archivo del backend, incluidos sus cambios previos y sus
dos pruebas nuevas; tampoco migraciones, credenciales, datos ni respaldos. No hay
add, commit, push, servicios remotos o cambios sobre otros repositorios.

## Recomendación

Puede pasar a una revisión de cierre H1.1-C con estas observaciones registradas:
cero avisos de dependencias de producción y cero altos/críticos en el árbol
completo, con pruebas y builds correctos. **No declarar la auditoría sin riesgos
pendientes:** los 16 moderados de herramientas siguen esperando una corrección
compatible o una decisión específica después de revisar las alternativas.
El cierre deberá considerar también la instalación habitual, la nueva verificación
Android y los requisitos remotos aún pendientes. Esta etapa se detiene aquí.
