// Solo para APK debug y un dispositivo/emulador con adb reverse tcp:3000 tcp:3000.
// Sin ese túnel, 127.0.0.1 pertenece a Android, no a la computadora del profesional.
export const environment = { production: false, apiBaseUrl: 'http://127.0.0.1:3000/api' };
