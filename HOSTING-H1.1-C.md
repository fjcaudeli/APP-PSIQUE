# PSIQUE — Cierre H1.1-C

Fecha: **06/11/2026**. Proyecto: **APP-PSIQUE**. Se consolidaron las correcciones
H1.1-A/B, se verificó el entorno habitual y se generó e instaló un APK debug
nuevo. No se cambiaron funcionalidades, pantallas, autenticación, reglas clínicas,
migraciones o credenciales. No se enviaron correos reales.

**Recomendación:** hay evidencia local suficiente para autorizar un commit
estable del inventario del apartado 9. No se identificó un bloqueo inmediato
para ese commit. Permanecen advertencias y comprobaciones previas a exponer
Express. Este cierre no certifica Render/Neon ni seguridad absoluta.
No se ejecutaron git add, commits, push, nuevas ramas o servicios remotos.

## 1. Estado inicial y final

Rama **main**, HEAD **099906eb81157bf906fa471030e2b202d8a0d526**, sin cambios
en el índice. Al comenzar ya estaban modificados package.json, package-lock.json
y backend/package-lock.json; estaban sin seguimiento el informe H1.1-B y las
dos pruebas JSON. Esos cambios anteriores se preservaron.

Al terminar siguen el mismo HEAD y rama: seis archivos rastreados modificados
y cuatro nuevos, detallados abajo. No hay cambios funcionales en src/,
backend/src/, scripts de arranque/compilación, configuración Android o SQL.
La única edición de código en C fue un comentario de la prueba JSON;
sus aserciones no cambiaron.

Al inicio no había API en 3000, frontend en 4200 ni emulador activo. Se inició
una API temporal sobre psique_test y el emulador existente. Al terminar, API
cerrada, APK en Login sin sesión, forward CDP y reverse retirados. No se
inició el backend habitual. Para probar con desarrollo hay que iniciarlo y
restablecer ADB reverse siguiendo [ANDROID.md](ANDROID.md).

## 2. Dependencias consolidadas

| Componente | Antes de A/B | Verificado en C |
| --- | --- | --- |
| Express | 5.2.1 | 5.2.1, conservado |
| body-parser, transitivo de Express | 2.3.0 | 2.4.0 |
| qs, transitivo de Express/body-parser | 6.16.0 | 6.17.1 |
| Angular runtime y compiler-cli | 21.2.22 | 21.2.26 |
| Angular CLI y Build | 21.2.23 | 21.2.29 |
| Ionic Angular | 9.0.2 | 9.0.2 |
| Capacitor core/android/CLI | 8.6.0 | 8.6.0 |
| Plugin App | 8.1.2 | 8.1.2 |
| TypeScript | 5.9.3 | 5.9.3 |
| RxJS / Zone.js | 7.8.2 / 0.15.1 | Sin cambios |
| Node.js / npm | 24.14.1 / 11.11.0 | Sin cambios |

Raíz: **npm ci --include=dev --no-audit --no-fund**, 502 paquetes instalados,
salida 0. La instalación habitual ya incorpora las correcciones que B había
probado en una copia. Los árboles npm ls consultados terminaron sin conflictos.
El backend ya coincidía con su lockfile y versiones corregidas; no fue necesario
reinstalarlo. Los manifiestos y lockfiles conservaron durante C sus SHA-256
iniciales: no hubo otra resolución ni actualizaciones adicionales.

Se mantienen Express 5 y Node 24, sin overrides, force, legacy-peer-deps o
cambios de middleware. El inventario completo y la resolución de B están en
[HOSTING-H1.1-B.md](HOSTING-H1.1-B.md).

## 3. Compilaciones y pruebas actuales

| Comprobación ejecutada en C | Resultado |
| --- | --- |
| Raíz: npm run test:config | **37 resultados aprobados**, cero fallos, cancelados u omitidos. |
| Guards originales con inyector Angular | Cuatro comprobaciones aprobadas: authGuard y accesoGuard con/sin token. Comprobación temporal, sin agregar tests al repositorio. |
| Interceptor JWT | Suite existente: origen/ruta autorizados, endpoints públicos, 401, respuesta tardía y origen Android. |
| Raíz: npm run build | Correcto en el entorno habitual. |
| Raíz: npm run build:production | Correcto con https://api.example.test/api, dominio reservado no consultado. |
| Bundle de producción | 54 archivos; URL reservada presente, API local ausente y cero coincidencias con los cinco secretos locales contrastados. |
| Backend: npm test | Compilación TypeScript y **88 resultados aprobados**, cero fallos, cancelados u omitidos. Incluye JSON. |
| Backend: lanzador privado -Tarea probar | Compilación TypeScript y **108 resultados PostgreSQL aprobados**, cero fallos, cancelados u omitidos; solo psique_test. |
| Raíz: npm run android:apk:local | Angular, Capacitor sync y Gradle correctos; APK generado. |

Las suites usan correo ficticio, reloj controlado y datos aislados. Los errores
de proveedor provocados por ciertos tests no fueron envíos reales. No se
borraron o desactivaron pruebas. Los 108 resultados PostgreSQL incluyen arranque,
transacciones, concurrencia, rollback, persistencia tras reiniciar y aislamiento.

El último build es Android local: www/browser contiene la API loopback y la
marca de preparación Android, como corresponde al APK. Para el futuro Static
Site se debe ejecutar build:production con la URL real; no publicar esa carpeta
local sin recompilar.

## 4. Revisión de las dos pruebas JSON

**backend/test/fixtures/servidor-json.mjs** abre crearAppPostgres en un proceso
propio, con puerto efímero loopback, JWT aleatorio y pool ficticio que devuelve
filas vacías. No abre PostgreSQL, SQLite o Resend. Cierra HTTP por IPC.
No requiere cuentas o datos privados ni agrega dependencias.

**backend/test/seguridad-json.test.mjs** inicia ese proceso y retira de su entorno
conexiones, JWT y proveedor. Comprueba JSON válido con campos faltantes (400),
equivalencia normal/gzip, JSON malformado (400 sin detalles internos), límite
32 KB normal y descomprimido (413), continuidad del proceso ante gzip inválido,
salud 200, stderr sin errores no manejados y cierre del proceso hijo.

Los casos simples 400/413 se superponen parcialmente con la suite histórica;
gzip, tamaño descomprimido y continuidad del proceso aportan cobertura distinta.
Pasaron en A y en la instalación habitual de C. El caso gzip inválido verifica
continuidad, sin exigir una única respuesta de transporte; no demuestra por
sí solo la reproducción de una vulnerabilidad concreta.

**Corrección menor:** se reemplazó únicamente el comentario que asociaba el
caso a un aviso específico por una explicación funcional prudente. Aserciones,
datos y tiempos intactos. Se recomienda versionar ambos archivos; no necesitan
otra corrección para incorporarlos. Son regresiones funcionales, no una auditoría
exhaustiva ni pruebas ofensivas.

## 5. APK anterior y nuevo

El APK anterior se copió y su hash se verificó **antes de compilar**. El respaldo
no se sobrescribió y sigue coincidiendo con la huella inicial.

| Dato | Anterior respaldado | Nuevo H1.1-C |
| --- | --- | --- |
| Tamaño | 4.459.210 bytes | **4.619.364 bytes** |
| SHA-256 | 946453476033a8342a02ff3185795ccc7870dec055866779c3288cbc69663ed2 | d7f93fd167c56919ec64945bc921949e57ec78e1ecac0b5f980e8e12c3cd2f60 |
| Estado | Respaldo comprobado | assembleDebug correcto; firma debug v2 verificada; instalado |

APK nuevo:

```text
C:\Users\franc\OneDrive\Desktop\APP-PSIQUE\android\app\build\outputs\apk\debug\app-debug.apk
```

Respaldo anterior:

```text
%LOCALAPPDATA%\PSIQUE\h11c-verificacion\2026-11-06\apk-anterior-antes-H11C-20261106.apk
```

Se usaron Temurin 21.0.13+9, Gradle 8.14.3, AGP 8.13.0, Platform 36 y Build-Tools
35.0.0 existentes. webDir continúa en www/browser; identificador
com.francocaudeli.psique. No se actualizaron esas herramientas ni se generó
release. HTTP debug sigue limitado a 127.0.0.1; release conserva HTTPS y la
protección contra bundles locales.

## 6. Regresión real Android

adb install -r: **Success**, emulador **Medium_Phone_API_37.0**, Android 17/API 37.
La app inició desde su actividad nativa y la WebView informó **Angular 21.2.26**:
se comprobó que el APK instalado contiene el frontend actualizado.

La API temporal usó el arranque real de Express compilado, rol/base psique_test,
JWT efímero y buzón de memoria. Se mantuvieron loopback, origen Android explícito,
ADB reverse y JWT obligatorio. Los fixtures se crearon por API y luego se
consultaron desde el APK; no se usó Resend para enviar.

| Recorrido | Resultado |
| --- | --- |
| Login | Formulario real, HTTP 200 y carga de Inicio. |
| Inicio/pacientes | Seis accesos con contadores; tres pacientes ficticios y fechas correctas. Ficha y Dashboard responden 200. |
| Agenda | Semana actual por defecto; siguiente semana con sesiones y franjas libres anteriores, intermedias y posteriores. |
| Agendamiento | Formulario, búsqueda P-003, duraciones 30/40/50/60 y Nota opcional. Confirmación deshabilitada si está incompleto. Sin guardar desde este formulario. |
| Sesiones | Agendadas con Nota, duración e importes; últimas realizadas por paciente; detalle con saldo. Paciente deshabilitado en edición pasada. |
| Histórico | Seis realizadas ordenadas: cinco en primera página y una en segunda. |
| Modales | Nota amarilla con texto completo; pendientes de cobro con saldos. |
| Teclado/Atrás | Teclado Android real y formulario redimensionado; Atrás oculta teclado, vuelve desde histórico y cierra modales. |
| Pantalla pequeña | 411 × 914 y 360 × 640 CSS: seis tarjetas visibles sin desborde horizontal. Tamaño restaurado. |
| Desconexión | Error visible sin red; restaurada la conexión y recargada la pantalla, pacientes responde 200. |
| Logout/guard | Login tras salir; localStorage y sessionStorage vacíos. Ruta privada a Login y API sin JWT 401. |
| Separación | Cuenta B muestra contadores en cero; ficha de A devuelve 404 y Paciente no encontrado. |

Capturas reales y metadatos HTTP sin tokens: artifacts/android/h11c/, ignorados
por Git. [ANDROID.md](ANDROID.md) enlaza Inicio, Nota, teclado, histórico y error.
El capturador Windows falló dos veces por el recorte del monitor; se usaron
capturas ADB y CDP en la WebView debug. Un selector temporal por texto acentuado
falló por la codificación del pipe; se utilizó el selector CSS existente y se
comprobó correctamente logout. No fue una regresión ni se cambió la aplicación.

No se repitió cada alta/guardado desde la UI Android: suites y fixtures API
cubrieron escrituras, y el recorrido nativo comprobó consultas, formularios y
navegación. Tampoco se probaron teléfono físico, todas las versiones Android,
API remota, enlaces de email desde Android o envío real. El APK local necesita
PC, Express, PostgreSQL y ADB; no acredita funcionamiento remoto.

## 7. Auditorías y riesgos residuales

| Auditoría repetida en C | Críticos | Altos | Moderados | Total |
| --- | ---: | ---: | ---: | ---: |
| Raíz: npm audit | 0 | 0 | **16** | **16** |
| Raíz: npm audit --omit=dev | 0 | 0 | 0 | **0** |
| Backend: npm audit | 0 | 0 | 0 | **0** |
| Backend: npm audit --omit=dev | 0 | 0 | 0 | **0** |

Resultado igual a B. La auditoría raíz completa devuelve código 1 por los avisos;
las otras tres, código 0. Son 16 paquetes afectados que propagan dos avisos
subyacentes, no 16 fallos independientes. Inventario y enlaces oficiales en
[H1.1-B](HOSTING-H1.1-B.md#auditoría-posterior-y-riesgos-pendientes).

- glob 13.0.7: GHSA-3g3m-2fjr-6pw4; trabajo de filesystem continúa tras abortar,
  consumiendo recursos. Parche desde 14.0.2; ciertos consumidores siguen en ^13.
- minimatch 10.2.6: GHSA-g3hv-75wg-m249; patrones manipulables bajo las condiciones
  de optimización del aviso. Parche desde 11.0.1; consumidores siguen en ^10.
- Los otros catorce paquetes propagan esas cadenas: Angular CLI,
  @npmcli/package-json/run-script, @sigstore/sign/tuf, @tufjs/models, cacache,
  ignore-walk, make-fetch-happen, npm-packlist, npm-registry-fetch, pacote,
  sigstore y tuf-js. La rama rimraf ya resolvió glob 14.0.4/minimatch 11.0.5.

Son herramientas de instalación/compilación, sin ruta identificada desde datos
de pacientes a esas funciones. No se publicará el servidor de desarrollo o CLI
como backend. Persisten riesgos durante el build: usar fuentes confiables y
revisar parches compatibles de los consumidores. No se fuerzan saltos mayores o
el retroceso de CLI propuesto por npm. npm audit informa avisos conocidos;
no prueba ausencia de otras vulnerabilidades ni sustituye revisar configuración.

## 8. Secretos, conservación y entrega académica

Se revisaron candidatos rastreados/nuevos, diff, exclusiones e índice. Se
comparó en memoria contra cinco secretos locales: tres contraseñas PostgreSQL,
JWT y Resend, sin imprimir valores. Cero coincidencias en candidatos, bundle
producción y assets APK. Tres patrones de URL PostgreSQL encontrados en tests
son ejemplos ficticios, sin coincidencia con las credenciales locales.

Se inspeccionaron los 60 assets del APK: API local esperada, sin URL reservada
de producción, archivos privados detectados o coincidencias de secretos. El
contraste no equivale a un análisis exhaustivo de toda información sensible.
No se agregaron logs o capturas a los candidatos del commit.

Las exclusiones cubren env reales, DPAPI, SQLite, respaldos, SDK local, keystores,
compilaciones, APK y evidencias. **Ningún archivo rastreado coincide actualmente
con las reglas de exclusión.** No se confió solo en gitignore ni se modificó
ese archivo en C.

Los **29 archivos protegidos** registrados al comenzar conservaron SHA-256:
env, SQLite, respaldos y credenciales privadas. El APK nuevo es el reemplazo
autorizado; su respaldo se comprobó por separado. Huellas y cantidades de filas
de usuarios/pacientes/turnos/sesiones en psique y psique_test coinciden antes y
después. Se retiraron solo dos cuentas ficticias y sus registros en psique_test.
Las secuencias de pruebas pueden avanzar al insertar/borrar fixtures; no se
reiniciaron ni se alteraron registros preexistentes.

**Entrega académica:** al inicio C no había carpeta local ni archivos de ella
rastreados en HEAD; la referencia de 87 rastreados era histórica. Para conservar
la entrega se recuperaron los **87 blobs originales** del padre de 099906e en
sus mismas rutas, sin tocar el índice. Se comprobaron iguales al historial por
SHA-256. Siguen ignorados, con cero archivos rastreados. No se regeneró, movió
ni eliminó ningún PDF.

En entrega_academica/PSIQUE_2026-11-01/ son legibles los tres finales:
Documentacion_Funcional_PSIQUE.pdf (21 páginas), Documentacion_Tecnica_PSIQUE.pdf
(30) y Presentacion_PSIQUE.pdf (15 diapositivas).

**Propuesta pendiente de aprobación:** entregar esos tres PDF separadamente;
conservar toda la carpeta, fuentes y capturas como copia local ignorada;
versionar código y guías operativas. No incorporar los 87 auxiliares.
El antiguo Documento_Funcional_PSIQUE.pdf de raíz ya está rastreado: se deja
intacto y se propone revisar después si debe identificarse como antecedente.
No hace falta git rm --cached para la carpeta actual; no se ejecutó esa operación
ni se modificó el índice o historial.

## 9. Inventario exacto del futuro commit

| Archivo | Estado | Motivo |
| --- | --- | --- |
| package.json | Modificado en B | Rangos Angular coordinados. |
| package-lock.json | Modificado en B | Resolución reproducible frontend/herramientas. |
| backend/package-lock.json | Modificado en A | body-parser y qs corregidos. |
| README.md | Modificado en C | Dependencias y APK vigentes. |
| ANDROID.md | Modificado en C | APK nuevo, respaldo y regresión; conserva el antecedente. |
| HOSTING-H1.md | Modificado en C | Enlace al cierre actual; resultados históricos conservados. |
| HOSTING-H1.1-B.md | Nuevo de B | Inventario y correcciones frontend. |
| HOSTING-H1.1-C.md | Nuevo de C | Cierre A/B/C y propuesta. |
| backend/test/fixtures/servidor-json.mjs | Nuevo de la ejecución previa | Servidor aislado sin base real. |
| backend/test/seguridad-json.test.mjs | Nuevo previo, comentario corregido en C | Regresión JSON/gzip. |

**Excluir:** node_modules, www/dist/out-tsc, cachés, APK anteriores/nuevos, SDK,
JDK, local.properties, firma debug, privados, bases/respaldos, herramientas/logs
temporales, capturas y entrega académica. Siguen fuera del índice. No se retiró
ningún archivo ya rastreado.

**Revisión manual antes de autorizar:** los diez archivos de la tabla,
especialmente el comentario JSON y riesgos moderados; confirmar la estrategia
de entrega independiente. El PDF antiguo de raíz no se incluye como cambio.

Mensaje propuesto:

```text
chore: consolidar dependencias y verificar Android antes del hosting
```

Una etiqueta anotada **v0.1.0-prehosting**, después del futuro commit aprobado,
serviría como referencia reproducible; no significa un despliegue. No se creó
etiqueta ni nueva rama.

## 10. Configuración futura conservada y pendientes

Los cambios no alteraron comandos o fuentes que definen PSIQUE_API_URL,
FRONTEND_ORIGIN, CAPACITOR_ANDROID_ORIGIN, DATABASE_SSL_MODE=verify-full, CORS,
JWT, rate limiting, pool o secretos. /health/live sigue sin SQL y se propone
como control automático; /health/ready queda para comprobar PostgreSQL
explícitamente. Sus tests existentes pasaron. Sin conexiones reales a Neon.

| Clasificación | Estado / siguiente comprobación |
| --- | --- |
| Aprobado localmente | Instalación raíz reproducible, árboles compatibles, builds web/Express/Android, 233 resultados de suites, cuatro comprobaciones de guards y recorrido Android integrado. |
| Advertencias sin bloqueo inmediato del commit | 16 moderados de herramientas, límites de cobertura y dependencia local del APK. Mantener seguimiento. |
| Bloqueos encontrados antes del commit | Ninguno en lo ejecutado. Pendientes autorización del usuario y decisión documental; no se publica automáticamente. |
| Antes de exponer Express | Validar Linux/módulos nativos con Node 24; roles/permisos, migraciones autorizadas y TLS verify-full reales en Neon; memoria/costo Argon2; arranque/cierre, despertar y recuperación 503. |
| Antes de integrar URLs públicas | URL HTTPS real, recompilar frontend, CORS exacto, origen Android optativo, proxy/CIDR verificado, rewrite SPA y cabeceras estáticas. Sin relajar validaciones. |
| Operación, datos y correo | Base remota vacía, app separada del migrador; backups/restauración, cuotas actuales y remitente/destinatario de correo definidos. |

El remitente de prueba Resend solo permite la casilla autorizada. Una demo
abierta a otros destinatarios requiere resolver dominio/remitente después;
no se saltará la confirmación de email. TLS/roles/conexión Neon, creación de
servicios Render/Neon, DNS y despliegue siguen fuera de esta autorización.

Logs y resultados completos: %LOCALAPPDATA%\PSIQUE\h11c-verificacion\2026-11-06.
Capturas Android en la carpeta ignorada indicada arriba. El cierre deja una
base local comprobada para decidir el commit y avanzar por etapas al hosting.
