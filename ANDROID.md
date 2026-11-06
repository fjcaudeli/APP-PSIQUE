# PSIQUE en Android con Capacitor

La aplicación Android incorpora el mismo frontend Ionic/Angular dentro de una
WebView. Express y PostgreSQL siguen fuera del teléfono. No hay base clínica
SQLite en Android, datos de ejemplo precargados ni otra API.

## Herramientas y proyecto

- Capacitor core, CLI y Android **8.6.0**, fijados en `package-lock.json`.
- `@capacitor/app` **8.1.2**, necesario para que Ionic maneje Atrás de Android.
- Node.js del proyecto: **24.14.1**; Capacitor 8 requiere Node 22 o superior.
- Android Studio estable **2025.2.1 o posterior**, con su JDK/JBR y SDK.
- Proyecto generado: SDK mínimo **24** (Android 7), compilación/target **36**.
- Java **21**, Android Gradle Plugin **8.13.0** y Gradle **8.14.3**.
- Identificador personal: `com.francocaudeli.psique`; nombre visible: **PSIQUE**.
- `capacitor.config.ts` usa **`webDir: 'www/browser'`**. No debe apuntar a `www`.

Instalar las dependencias npm con `npm.cmd ci` desde la raíz. No hace falta Ionic
o Capacitor global. El proyecto nativo `android/` se conserva en Git; no se vuelve
a ejecutar `cap add android` cada vez. Sus assets web, SDK local, cachés, APK y
claves de firma no se versionan.

## Completar Android Studio en Windows

1. Instalar la edición estable y finalizar el asistente estándar de SDK.
2. En **SDK Manager**, instalar **Android SDK Platform 36**, Platform-Tools,
   Android SDK Build-Tools requeridos por Gradle y, para un emulador, Android
   Emulator y una imagen de sistema compatible, por ejemplo API 36 o 37.
   Aceptar personalmente las licencias.
   El SDK suele quedar en `%LOCALAPPDATA%\Android\Sdk`.
3. En **Settings → Build, Execution, Deployment → Build Tools → Gradle**, usar
   Java 21 para Gradle. Studio 2026.2.2 incluye JBR 25, incompatible con Gradle
   8.14.3: se conserva el runtime del IDE y se usa un JDK 21 portátil separado
   para el proyecto. No actualizar Gradle/AGP automáticamente en este paso.
4. Para un emulador, crear un dispositivo en **Device Manager**, con una imagen
   x86_64 compatible con la PC, y arrancarlo. Para un teléfono, conectar USB,
   habilitar Depuración USB manualmente y aceptar la autorización de esa PC.

Los scripts detectan el SDK estándar y buscan primero un JDK 21 portátil en
`%LOCALAPPDATA%\PSIQUE\android-tools\jdk-21\jdk-21...`; después prueban el JBR de
Android Studio si su versión es compatible. `JAVA_HOME` explícito tiene prioridad.
En esta PC se preparó Temurin **21.0.13+9**, descargado de Adoptium y comprobado
con SHA-256, sin modificar PATH ni JAVA_HOME del sistema. El archivo local ignorado
`android/.gradle/config.properties` indica ese JDK para `GRADLE_LOCAL_JAVA_HOME`
en el IDE; no se versiona una ruta personal.
Si las herramientas están en otra carpeta, definir **solo en la terminal de
trabajo**, adaptando estas rutas:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\RUTA-REAL-DEL-JDK-21"
```

## Preparar, abrir y generar el APK local

Desde la raíz:

```powershell
# Compila Angular optimizado sin mapas de código y lo copia a Android.
npm.cmd run android:sync:local
# Abre el proyecto android/ en Android Studio.
npm.cmd run android:open
# Compila, sincroniza y ejecuta assembleDebug con Gradle.
npm.cmd run android:apk:local
```

La ruta esperada **cuando Gradle termina correctamente** es:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Si faltan SDK o Java, el comando falla y no informa que el APK se generó.
También puede usarse **Run** o la acción de generar APK de depuración de Android
Studio después de `android:sync:local`. El primer Gradle Sync descarga dependencias
y puede solicitar componentes del SDK. El APK debug es para prueba académica,
no para publicación ni para datos clínicos de producción.

Cada cambio del frontend requiere repetir `android:sync:local` y recompilar;
`npm.cmd start` por sí solo no actualiza una app ya instalada. La app carga sus
archivos empaquetados, sin `server.url`, live reload ni navegación remota.

En esta PC, con 16 GB de RAM, conviene compilar primero y arrancar el emulador
después. Android Studio, Gradle y el emulador juntos pueden consumir demasiada
memoria. Se verificó la apertura del proyecto en Studio y luego se cerró el IDE
para completar las pruebas desde ADB. No es necesario mantener el IDE abierto
para usar un APK ya instalado.

## Express local por ADB, sin publicar la API

`127.0.0.1` dentro de Android es el teléfono/emulador. La dirección del bundle
local solo funciona **después de crear expresamente el túnel ADB**. Esta es la
opción elegida tanto para emulador como para teléfono USB.

En una terminal de backend, desde la raíz:

```powershell
$env:CAPACITOR_ANDROID_ORIGIN = "https://localhost"
& "$env:LOCALAPPDATA\PSIQUE\postgresql-local\Herramientas-PostgreSQL.ps1" -Tarea dev
```

Si ya existe otro backend en el puerto 3000, detenerlo en su terminal antes de
iniciar este. No se cambian `.env`, DPAPI, credenciales ni el rol PostgreSQL.
Express sigue escuchando exclusivamente en **127.0.0.1:3000**, no en 0.0.0.0.

En otra terminal:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb reverse tcp:3000 tcp:3000
& $adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n com.francocaudeli.psique/.MainActivity
```

Con varios dispositivos, agregar `-s IDENTIFICADOR` a cada comando ADB, usando
el identificador devuelto por `devices`. El dispositivo debe figurar como
`device`, no `unauthorized` u `offline`. Al reconectar puede ser necesario repetir
`reverse`. Al finalizar se puede retirar con `adb reverse --remove tcp:3000`.

La opción `CAPACITOR_ANDROID_ORIGIN` agrega **solo `https://localhost`** a CORS,
además del origen web existente. Es el origen de la WebView local, no la URL de
Express. Sin esa opción Android no queda permitido. Se conservan los métodos,
encabezados autorizados, JWT, validaciones y aislamiento por profesional.
`FRONTEND_ORIGIN` sigue identificando a la versión web y a los enlaces de correo.

### Alternativas de conexión

| Alternativa | Alcance |
| --- | --- |
| ADB reverse (elegida) | Emulador o teléfono USB autorizado accede a Express local sin abrir el firewall ni exponerlo a la red. Requiere PC, backend y túnel activos. |
| `10.0.2.2` | Alias del emulador Android para acceder al loopback de la PC; no funciona como dirección de la PC en un teléfono físico. No se usa en este bundle ni se añadió una excepción HTTP para ese host. |
| API remota HTTPS | Permitirá usar Android sin esta PC cuando exista un backend publicado con certificado válido, CORS Android explícito y PostgreSQL accesible desde el servidor. No hay infraestructura remota creada. |

## HTTP de prueba y HTTPS de distribución

El origen del contenido empaquetado permanece **`https://localhost`**.
`server.cleartext` y `android.allowMixedContent` están en `false` en Capacitor.
La variante **debug** tiene una política de red separada: permite HTTP únicamente
a **127.0.0.1**, y el contenedor habilita contenido mixto únicamente cuando
`BuildConfig.DEBUG` es verdadero. Sirve para la API local dentro del túnel ADB.
No se permite HTTP general, certificados no confiables ni se cambia TLS del backend.

La variante **release** no incorpora esa política debug ni activa contenido mixto.
Una tarea Gradle impide compilar release con el bundle local o sin la marca de
preparación Android. Para el futuro backend HTTPS:

```powershell
# Usar la URL real cuando exista; no hay una dirección remota predeterminada.
$env:PSIQUE_API_URL = "https://DOMINIO-REAL-DE-TU-API/api"
npm.cmd run android:sync
# Genera también un APK debug, pero conectado a esa API HTTPS.
npm.cmd run android:apk
```

Los scripts validan HTTPS y rechazan credenciales en la URL, parámetros y
loopback antes de compilar. La URL de la API es pública; ninguna contraseña,
JWT de usuario, conexión PostgreSQL ni clave Resend debe incluirse en el APK.
Una distribución release firmada y Google Play quedan fuera de esta etapa.

## Confirmación y recuperación por correo

Se mantienen los flujos actuales y sus endpoints. Los enlaces de email continúan
abriéndose en la **versión web**, no se agregaron App Links ni otro método de
autenticación. Después de confirmar o cambiar la contraseña, volver al APK e
iniciar sesión normalmente.

Para abrir esos enlaces web locales desde el teléfono también se necesita Angular
en el puerto 4200 (`npm.cmd start` en otra terminal) y
`adb reverse tcp:4200 tcp:4200`. No se cambia el origen de los correos a
`https://localhost`: ese host identifica los assets del APK, no un servidor web
público. Continúa vigente la restricción de Resend de pruebas a la casilla
autorizada; esta preparación no envía correos reales.

## Verificación y límites

Compilar Angular y sincronizar Capacitor **no equivale** a compilar un APK, ni a
probarlo en Android. La validación real requiere generar el APK, instalarlo y
recorrer Login, formularios, navegación, modales, calendario y teclado en un
emulador o teléfono. Sin una API accesible pueden mostrarse pantallas públicas,
pero no se acredita login ni funcionamiento clínico integrado.

Las pruebas automatizadas usan datos ficticios aislados en `psique_test`; nunca
se crean pacientes de demostración en `psique` para validar Android. No se
modifican migraciones ni se cambia la fecha de Windows para probar sesiones.

## Estado comprobado el 06/11/2026 — H1.1-C

Se repitió `npm.cmd run android:apk:local` después de `npm ci` en el entorno
habitual. Angular **21.2.26** se comprobó también en la WebView instalada;
CLI/build es 21.2.29. Capacitor, App, Java 21, Gradle, AGP y SDK se conservaron.

| Comprobación de esta regresión | Resultado |
| --- | --- |
| Build | Angular, sync y Gradle correctos; firma debug v2 verificada. |
| Instalación | Correcta en Medium_Phone_API_37.0, Android 17/API 37. |
| Integración | API aislada sobre psique_test, correo ficticio, CORS y ADB reverse. Login, pacientes, ficha, Agenda semanal, sesiones agendadas, últimas sesiones, Notas e histórico. |
| Formularios | Búsqueda de paciente, duraciones 30/40/50/60 y paciente bloqueado en sesión pasada. No se guardó desde esos formularios. |
| Histórico/modales | Seis realizadas en páginas de cinco y una; Nota amarilla y pendientes de cobro con saldos. |
| Teclado/Atrás | Teclado real, formulario redimensionado; Atrás oculta teclado, vuelve desde histórico y cierra modales. |
| Pantalla pequeña | 411 × 914 y 360 × 640 CSS, seis tarjetas visibles, sin desborde horizontal. Tamaño restaurado. |
| Error de red | Error visible sin conexión; pacientes vuelve a responder 200 después de restaurar y recargar. |
| Logout/aislamiento | Almacenamiento local/temporal vacío, guard a Login, API sin JWT 401; cuenta B vacía y ficha de A 404. |
| Conservación | Dos cuentas ficticias retiradas solo de psique_test; huellas de filas de ambas bases iguales a las iniciales. |

APK nuevo:

```text
android/app/build/outputs/apk/debug/app-debug.apk
Tamaño: 4.619.364 bytes
SHA-256: d7f93fd167c56919ec64945bc921949e57ec78e1ecac0b5f980e8e12c3cd2f60
```

Antes de compilar se conservó el APK de 4.459.210 bytes, con su SHA-256 original,
en `%LOCALAPPDATA%\PSIQUE\h11c-verificacion\2026-11-06\apk-anterior-antes-H11C-20261106.apk`.
La copia sigue coincidiendo con la huella inicial. Las capturas nuevas reales
están en `artifacts/android/h11c/`, ignoradas por Git:

- [Inicio](artifacts/android/h11c/03-inicio.png).
- [Modal de Nota](artifacts/android/h11c/05-nota-modal.png).
- [Inicio a 360 × 640](artifacts/android/h11c/07-inicio-360x640.png).
- [Teclado](artifacts/android/h11c/02-teclado.png).
- [Histórico paginado](artifacts/android/h11c/04-historico-paginado.png).
- [Error de conexión](artifacts/android/h11c/06-error-conexion.png).

Al finalizar quedó el emulador en Login, sin sesión; la API de pruebas y los
túneles temporales se cerraron. No había backend habitual activo al comenzar
y no se inició uno al terminar. Para probar con desarrollo, ejecutar el backend
y repetir `adb reverse` como se explica arriba.

No se probó teléfono físico, API remota o release. Las altas y guardados de
esta regresión se comprobaron por suites/API, sin repetir cada escritura desde
Android. El capturador de ventanas Windows falló; se usaron capturas ADB y CDP
en la WebView debug. Sin cambios funcionales. Auditoría actual: backend y
producción frontend sin avisos; 16 moderados de herramientas frontend.
Ver [cierre completo H1.1-C](HOSTING-H1.1-C.md).

## Antecedente: estado comprobado el 01/11/2026

| Comprobación | Resultado |
| --- | --- |
| Angular para Android local y sincronización | Correctos, con plugin App detectado. |
| Angular Android para HTTPS | Compila y sincroniza con un dominio reservado de prueba, sin conectarse a él ni incluir la API local. |
| Configuración HTTPS inválida | Tres casos rechazados antes de compilar, sin imprimir credenciales. |
| Pruebas Angular | 37 resultados aprobados, incluido interceptor con origen Android. |
| Pruebas PostgreSQL | 108 resultados aprobados en psique_test, incluido CORS Android optativo y JWT obligatorio. |
| Backend histórico y reglas | 87 resultados aprobados. |
| Compilación TypeScript de Express | Correcta. |
| Angular web habitual | `npm.cmd run build` correcto después del ajuste de márgenes nativos. |
| Android Studio | 2026.2.2 instalado; asistente completado y proyecto nativo abierto. |
| Java y Gradle | Temurin 21.0.13+9 portátil verificado y Gradle 8.14.3 ejecutado correctamente con ese JDK. |
| SDK Android | Platform 36 y Build-Tools 35.0.0 instalados por Gradle; el asistente también instaló Platform 37 e imagen de emulador 37. |
| APK | `npm.cmd run android:apk:local` completado; `assembleDebug` correcto y firma debug verificada con `apksigner`. |
| Instalación y ejecución | `adb install -r` correcto en `Medium_Phone_API_37.0`, Android 17/API 37. PSIQUE inicia desde su actividad nativa. |
| Red y seguridad | API por ADB reverse; CORS exacto, JWT obligatorio. Manifest y política de red compilados inspeccionados: HTTP permitido solo a 127.0.0.1 en debug. |
| Protección release | La tarea Gradle rechazó expresamente el bundle local. No se generó una distribución release. |
| Registro y login | Alta desde el APK: 201; login antes de confirmar: 403; tras confirmar con el adaptador de correo ficticio: 200. No se enviaron correos reales. |
| Pacientes y reservas | Alta y edición de ficha, búsqueda de paciente, reserva de 40 minutos, honorarios y Nota opcional comprobados con respuestas reales de Express. |
| Consulta y cobros | Calendario, Notas, modal amarillo, sesiones agendadas, últimas sesiones y cobro parcial comprobados. El paciente de una sesión pasada aparece bloqueado. |
| Histórico | Seis sesiones realizadas: cinco en la primera página y una en la segunda, ordenadas de más reciente a más antigua. |
| Persistencia | Los registros siguieron disponibles al reinstalar y reabrir el APK. Una conexión SQL nueva confirmó los mismos registros en psique_test. No se reinició Express durante este recorrido. |
| Teclado y Atrás | Teclado Android real visible, formulario redimensionado; Atrás oculta el teclado y cierra el modal de Nota. |
| Visualización | Pantallas reales de 411 × 914 y 360 × 640 píxeles CSS; seis accesos visibles en Inicio, sin desborde horizontal. Ajuste del margen superior exclusivo de Capacitor. |
| Logout y aislamiento | Sesión local retirada, ruta privada redirige a Login; la cuenta B ve contadores en cero y obtiene 404 al abrir la ficha de A. |
| Error de red | Simulación de falta de conexión en la WebView: mensaje de carga fallida; al restaurar la red vuelve a consultar los datos correctamente. |
| Limpieza | Retiradas solo las dos cuentas ficticias y sus 2 pacientes, 8 turnos y 7 sesiones de psique_test. Una comprobación posterior encontró cero registros de esas cuentas. |
| Entorno al finalizar | API aislada detenida; backend habitual iniciado con psique_app/psique y origen Android explícito. Salud consultada desde la WebView: 200; ruta privada sin JWT: 401. APK en Login, sin cuenta de prueba iniciada. |

APK histórico comprobado el 01/11, conservado en el respaldo de H1.1-C:

```text
C:\Users\franc\OneDrive\Desktop\APP-PSIQUE\android\app\build\outputs\apk\debug\app-debug.apk
Tamaño: 4.459.210 bytes
SHA-256: 946453476033A8342A02FF3185795CCC7870DEC055866779C3288CBC69663ED2
```

Las capturas son del emulador real, con datos ficticios. Se guardan localmente en
`artifacts/android/`, fuera del versionado:

- [Inicio del APK final](artifacts/android/15-inicio-final.png).
- [Modal de Nota del APK final](artifacts/android/16-nota-final.png).
- [Inicio a 360 × 640](artifacts/android/17-inicio-360x640.png).
- [Teclado Android](artifacts/android/02-teclado.png).
- [Histórico paginado](artifacts/android/12-historico-paginado.png).
- [Error de conexión simulado](artifacts/android/14-error-conexion.png).

No se probaron un teléfono físico, todas las versiones desde minSdk 24, una API
remota HTTPS ni el recorrido de enlaces de correo desde Android. El APK local
necesita la PC, PostgreSQL, Express y ADB reverse activos. No acredita uso completo
fuera de esa configuración. Las pruebas Java de ejemplo de la plantilla no se
ejecutaron. El correo se comprobó aquí mediante un adaptador ficticio aislado;
Resend y sus credenciales de desarrollo no se usaron para esas pruebas.

En esa verificación histórica, `npm audit` informó 34 avisos: 32 ya presentes al incorporar el runtime y dos
moderados adicionales de herramientas CLI. No se ejecutó `audit fix` ni se
modificaron versiones ajenas a esta integración.

## Archivos de esta integración

- `package.json` y `package-lock.json`: dependencias Capacitor y comandos Android.
- `capacitor.config.ts`: identidad nativa, directorio web y configuración segura.
- `angular.json` y `src/environments/environment.android-local.ts`: compilación
  local para ADB, sin cambiar el entorno web habitual.
- `scripts/preparar-android.mjs`: compila, valida la URL, sincroniza y genera APK.
- `android/`: contenedor nativo, Gradle, recursos, políticas de red y protección
  del build release. No se reescribieron pantallas en Java.
- `src/app/app.component.scss`: margen superior nativo para la barra de estado.
- `backend/src/configuracion.ts`, `backend/src/seguridad-http.ts` y
  `backend/.env.example`: segundo origen CORS optativo, manteniendo JWT y permisos.
- `backend/test-postgres/seguridad.test.mjs` y `test-config/frontend.test.mjs`:
  comprobaciones de CORS y del interceptor con origen Android.
- `.gitignore`, `README.md` y esta guía: exclusión de artefactos e instrucciones.

No se modificaron migraciones, datos de desarrollo, archivos SQLite ni respaldos.
No se hicieron commits, push ni despliegues.

## Referencias oficiales

- [Instalar Capacitor en un proyecto existente](https://capacitorjs.com/docs/getting-started).
- [Requisitos de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup).
- [Android y SDK de Capacitor 8](https://capacitorjs.com/docs/updating/8-0).
- [Android Studio en Windows](https://developer.android.com/studio/install).
- [Botón Atrás y plugin App](https://ionicframework.com/docs/developing/hardware-back-button).
- [Acceso al servidor local mediante ADB](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server).
- [Políticas de red Android](https://developer.android.com/privacy-and-security/security-config).
- [Compatibilidad Java/Gradle](https://docs.gradle.org/current/userguide/compatibility.html).
- [JDK Temurin portátil y verificación de checksum](https://adoptium.net/installation/archives).
