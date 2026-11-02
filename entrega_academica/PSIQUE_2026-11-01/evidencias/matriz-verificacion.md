# Matriz de evidencia de la entrega

Las suites se ejecutaron el 01/11/2026 en horario de Buenos Aires. Los logs conservan su salida completa y los números no suman etapas anteriores.

| Aspecto documentado | Fuente de implementación | Evidencia ejecutada |
| --- | --- | --- |
| Registro, login y JWT | backend/src/auth.ts y auth-postgres.ts | test-postgres/auth.test.mjs, incluido en pruebas-postgresql.txt. |
| Confirmación y recuperación | cuenta-correo.ts y correo.ts | cuenta-correo.test.mjs y cuentas-anteriores.test.mjs; correo simulado, sin envíos nuevos reales. |
| Integridad del esquema | migrations/001 a 008 | esquema.test.mjs y migraciones.test.mjs. No se migró desarrollo para redactar la entrega. |
| Reservas e intervalos | agenda-calendario.ts y consultorio-postgres.ts | calendario.test.mjs y api.test.mjs, incluidos en la suite PostgreSQL. |
| Inicio del tratamiento | consultorio-postgres.ts, actualizarInicioTratamiento | inicio-tratamiento.test.mjs. |
| Nota al reservar | consultorio-postgres.ts, separarNota y crearSesion | nota-reserva.test.mjs. |
| Agendadas, últimas e histórico | consultorio-postgres.ts y pantallas correspondientes | agendadas.test.mjs, ultimas-sesiones.test.mjs e historial-paciente.test.mjs. |
| Arranque y persistencia | server.ts y db/postgres.ts | servidor.test.mjs. Los reinicios de servidor pertenecen a esa suite; no se reinició la API habitual durante las capturas. |
| CORS y disponibilidad | seguridad-http.ts, configuracion.ts y disponibilidad.ts | seguridad.test.mjs, con origen Android optativo. |
| Frontend | test-config/*.test.mjs | pruebas-frontend.txt: 37 aprobadas. |
| Referencia histórica y reglas | backend/test/*.test.mjs | pruebas-backend-historico.txt: 87 aprobadas, con SQLite temporal. |
| Compilación web | angular.json y fuentes Angular | compilacion-web.txt: build correcto. |
| Firma del APK existente | android/app/build/outputs/apk/debug/app-debug.apk | firma-apk.txt: firma v2 válida. La compilación e instalación nativa fueron comprobadas en la etapa Android anterior. |
| Capturas reales | APK instalado, API aislada 3001 y psique_test | 18 originales en recursos/capturas, capturas-integracion.json y recortes.json. |
| Preservación del proyecto | SHA-256 al comenzar y al terminar la tarea | integridad-proyecto.json: 168 archivos existentes controlados, ninguno alterado. |
| Calidad de documentos | Tres PDF finales | verificacion-pdf.json y revision-visual.md. |

La suite PostgreSQL terminó con 108 pruebas aprobadas, sin fallos ni omisiones. Los nombres anteriores corresponden a archivos de prueba actuales, no a nuevas funcionalidades agregadas para esta entrega.

Las capturas recorrieron Login, Inicio, pacientes, ficha, pendientes, agenda, reserva sin confirmar nuevos cambios, detalle, edición histórica con paciente bloqueado, histórico, Notas, modal de Nota, cobros, agendadas y segunda página del histórico. Los registros de demostración se prepararon mediante la API pública/privada real en pruebas y se retiraron solo por el ID de su cuenta ficticia.

Los archivos de evidencia no incluyen cabeceras Authorization, tokens originales, contraseñas, connection strings ni claves de envío. La cuenta de demostración utilizó un email ficticio bajo example.test.
