import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarUrlApi } from '../src/environments/configuracion-api.ts';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const argumentos = process.argv.slice(2);
const local = argumentos.includes('--local');
const apk = argumentos.includes('--apk');

function ejecutar(programa, args, opciones = {}) {
  const resultado = spawnSync(programa, args, { cwd: raiz, stdio: 'inherit', windowsHide: true, ...opciones });
  if (resultado.error || resultado.status !== 0) throw new Error('El paso anterior falló; no se informa una compilación exitosa.');
}

function entornoAndroid() {
  const entorno = { ...process.env };
  const sdk = entorno.ANDROID_HOME || entorno.ANDROID_SDK_ROOT || join(entorno.LOCALAPPDATA || '', 'Android', 'Sdk');
  const studio = join(entorno.ProgramFiles || 'C:/Program Files', 'Android', 'Android Studio', 'jbr');
  // Studio 2026 incluye Java 25, que no ejecuta el Gradle 8 del proyecto.
  // Preferimos el JDK 21 portátil local; no modificamos el runtime del IDE.
  const carpetaJdk = join(entorno.LOCALAPPDATA || '', 'PSIQUE', 'android-tools', 'jdk-21');
  const portatil = existsSync(carpetaJdk) ? readdirSync(carpetaJdk, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('jdk-21'))
    .map(e => join(carpetaJdk, e.name)).find(p => existsSync(join(p, 'bin', 'java.exe'))) : undefined;
  const javaHome = entorno.JAVA_HOME || portatil || (existsSync(join(studio, 'bin', 'java.exe')) ? studio : undefined);
  if (!existsSync(join(sdk, 'platforms', 'android-36', 'android.jar'))) {
    throw new Error('Falta Android SDK Platform 36. Instalalo con SDK Manager de Android Studio y configurá ANDROID_HOME si está en otra carpeta.');
  }
  if (javaHome) entorno.JAVA_HOME = javaHome;
  entorno.ANDROID_HOME = sdk;
  const java = javaHome ? join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const version = spawnSync(java, ['-version'], { env: entorno, encoding: 'utf8', windowsHide: true });
  const numero = Number((version.stderr + version.stdout).match(/version "(\d+)/)?.[1]);
  if (version.status !== 0 || numero < 21 || numero > 24 || !numero) {
    throw new Error('Gradle 8 requiere Java compatible entre 21 y 24 para este proyecto. Usá JDK 21 mediante JAVA_HOME; el JBR 25 de Studio no es compatible.');
  }
  return entorno;
}

try {
  if (argumentos.some(a => !['--local', '--apk'].includes(a))) throw new Error('Opciones válidas: --local y --apk.');
  // Solo --local permite loopback. El flujo habitual exige una API HTTPS explícita,
  // igual que la versión web de producción: no hay un backend remoto ficticio.
  const apiBaseUrl = local ? 'http://127.0.0.1:3000/api' : validarUrlApi(process.env.PSIQUE_API_URL, true);
  const entorno = apk ? entornoAndroid() : process.env;
  const angular = join(raiz, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  ejecutar(process.execPath, [angular, 'build', '--configuration', local ? 'android-local' : 'production',
    ...(!local ? [`--define=PSIQUE_API_URL=${JSON.stringify(apiBaseUrl)}`] : [])]);

  // La marca no contiene credenciales: Gradle la usa para impedir que un build
  // local se distribuya por error como release. Se copia junto con Angular.
  writeFileSync(join(raiz, 'www', 'browser', 'psique-build.json'), JSON.stringify({ plataforma: 'android', local, apiBaseUrl }, null, 2) + '\n');
  ejecutar(process.execPath, [join(raiz, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android']);

  if (apk) {
    const android = join(raiz, 'android');
    if (process.platform === 'win32') {
      ejecutar(process.env.ComSpec || 'cmd.exe', ['/d', '/q', '/c', 'gradlew.bat', 'assembleDebug', '--console=plain'], { cwd: android, env: entorno });
    } else {
      ejecutar('./gradlew', ['assembleDebug', '--console=plain'], { cwd: android, env: entorno });
    }
    const archivo = join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!existsSync(archivo)) throw new Error('Gradle terminó sin generar el APK esperado.');
    console.log(`APK de depuración generado: ${archivo}`);
  } else {
    console.log('Android sincronizado. Para generar el APK se necesita Android Studio, su SDK y Java.');
  }
} catch (error) {
  // Solo se imprimen mensajes propios o del validador; nunca el entorno completo.
  console.error(error.message);
  process.exitCode = 1;
}
