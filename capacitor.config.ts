import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.francocaudeli.psique',
  appName: 'PSIQUE',
  webDir: 'www/browser',
  // Se empaqueta Angular; nunca se carga un servidor web remoto dentro del APK.
  server: { hostname: 'localhost', androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
  plugins: { SystemBars: { insetsHandling: 'css' } },
};

export default config;
