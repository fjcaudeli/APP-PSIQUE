# Guion de exposición de PSIQUE

15 diapositivas. Duración orientativa: 12 a 15 minutos. Los números son resultados de pruebas o datos ficticios, según el contexto.

## 1. PSIQUE
Presentar PSIQUE como aplicación para seguimiento básico de sesiones y administración de consultorio. Identificar institución, carrera, autor y docente. Aclarar que se mostrará el alcance implementado y sus límites reales.

Fuentes: Datos institucionales confirmados por el autor. Código actual y documentación de esta entrega.

## 2. El problema del consultorio
Explicar la necesidad sin inventar estadísticas o entrevistas. El problema planteado es organizativo: reunir datos de una misma práctica profesional y poder consultarlos con rapidez. La aplicación no reemplaza el criterio terapéutico.

Fuentes: Documento Funcional existente, problema del proyecto y módulos actuales de PSIQUE.

## 3. Un circuito de trabajo completo
Describir el recorrido de una persona nueva. El paciente puede crearse sin reserva y quedar en pendientes. El paso del tiempo no confirma asistencia ni crea automáticamente una sesión semanal. La última reserva terminada vuelve a poner al paciente activo en pendientes.

Fuentes: src/app/paciente-crear, proximas-sesiones, agendar y sesion-detalle; backend/src/agenda-calendario.ts.

## 4. Arquitectura cliente-servidor
Recorrer las tres capas. El navegador o la WebView no acceden directamente a PostgreSQL. Express valida identidad y negocio y utiliza pg. Resend se usa únicamente para correos de acceso. Todas las operaciones habituales utilizan PostgreSQL, sin fallback SQLite.

Fuentes: backend/src/server.ts, app-postgres.ts, api.ts, db/postgres.ts y correo.ts; capacitor.config.ts.

## 5. Tecnologías utilizadas
Diferenciar tecnologías de aplicación y herramientas de compilación. Los lockfiles fijan versiones exactas. better-sqlite3 permanece solo como referencia y pruebas históricas. No se agregaron un ORM, microservicios ni una segunda API.

Fuentes: package-lock.json de raíz y backend; android/variables.gradle, build.gradle y gradle-wrapper.properties; psql --version.

## 6. Acceso y separación entre cuentas
Mostrar el Login real. Explicar que el guard cuida navegación y el backend autoriza datos. El token no cifra su contenido ni contiene información clínica. La recuperación de contraseña invalida versiones anteriores de JWT. Logout es local y no revoca individualmente un token ya copiado.

Fuentes: backend/src/auth.ts, auth-postgres.ts, cuenta-correo.ts; src/app/auth y services/auth.service.ts. Captura 01-login.

## 7. Inicio concentra los pendientes
Los números mostrados son de la cuenta ficticia de demostración. Últimas sesiones cuenta pacientes representados, no todas las sesiones. Notas cuenta solo textos existentes aunque su pantalla también muestre las vacías. Las cantidades se refrescan al entrar.

Fuentes: src/app/inicio/inicio.page.ts; backend/src/db/consultorio-postgres.ts, dashboard y ultimasSesiones. Captura 02-inicio.

## 8. Pacientes identificados por código
Señalar la próxima fecha calculada, la fecha de creación inmutable y el inicio del tratamiento derivado de Realizadas. Nuevos pacientes comienzan Activo. Suspender o vacaciones retiran de pendientes; la baja explícita además cancela reservas aún no iniciadas, sin borrar histórico o importes.

Fuentes: src/app/pacientes y paciente-detalle; backend/src/validar-paciente.ts y db/consultorio-postgres.ts. Capturas 03 y 04.

## 9. Agenda semanal sin superposiciones
Mostrar la agenda real ampliada del emulador. Los inicios son cada 15 minutos y se valida el intervalo completo. La reserva exige un paciente activo y solo una fecha futura, salvo dos bloques contiguos ese día. No se cargan rangos laborables separados. Una reserva simultánea conflictiva recibe 409 sin guardado parcial.

Fuentes: backend/src/agenda-calendario.ts y db/consultorio-postgres.ts; src/app/shared/calendario.component. Captura 08-agenda-amplia.

## 10. Seguimiento: histórico y próxima Nota
El histórico incluye solo sesiones marcadas Realizada y pagina de cinco en cinco. El resumen de 100 caracteres pertenece a esa sesión. La Nota de 300 caracteres es un único texto vigente de la ficha para el próximo encuentro, sin versiones históricas. Las capturas contienen textos ficticios.

Fuentes: src/app/paciente-historico y notas; backend/src/db/consultorio-postgres.ts, historialPaciente y sesionesAgendadas. Capturas 13 y 15.

## 11. Honorarios y cobros por sesión
Usar el ejemplo de ARS 30.000, cobrado acumulado ARS 15.000 y saldo ARS 15.000. Se guardan centavos enteros. Al recibir el resto se escribe 30000 como total cobrado. Solo una Realizada con saldo positivo integra pendientes. No hay movimientos individuales, medios de pago ni facturación en esta versión.

Fuentes: backend/src/reglas-api.ts y db/consultorio-postgres.ts; src/app/shared/importes.ts. Capturas 11 y 16.

## 12. PSIQUE ya dispone de un APK instalable
La captura es de la actividad nativa real, con barras del sistema. Distinguir instalación Android y backend remoto. El APK incorpora los assets de Angular desde www/browser. HTTP se limita al loopback de debug y release exige API HTTPS. No existe publicación en Google Play.

Fuentes: capacitor.config.ts, android/, ANDROID.md; firma-apk.txt y hash del APK. Captura 17-sesiones-agendadas.

## 13. Modelo de datos e integridad
Explicar usuarios, pacientes, turnos y sesiones. La tabla migraciones es técnica. Pacientes usa clave compuesta y sesiones referencia paciente y turno con propietario. El índice único parcial permite conservar cancelaciones. La prevención de cruces de intervalos se hace en el backend bajo bloqueo, no por ese índice solo. No hay RLS.

Fuentes: backend/migrations/001 a 008; scripts/migrar.mjs; db/consultorio-postgres.ts.

## 14. Pruebas reproducidas para esta entrega
No sumar cantidades de etapas anteriores. Cada suite terminó sin fallos ni omisiones. La compilación web también pasó. Android fue recorrido con cuentas ficticias y la firma del mismo APK se verificó de nuevo. Los datos de captura de psique_test se retiraron al finalizar, sin limpiar desarrollo ni enviar correos reales.

Fuentes: evidencias/pruebas-postgresql.txt, pruebas-backend-historico.txt, pruebas-frontend.txt, compilacion-web.txt, firma-apk.txt y capturas-integracion.json.

## 15. Estado actual y próximos pasos
Cerrar con el alcance demostrado. No atribuir despliegue a Render, Neon u otro proveedor. Aclarar que objetivos estructurados, lista de espera, reportes ampliados y bloqueo por inactividad pertenecen a la evolución pendiente. Ofrecer el manual funcional y el técnico como material para evaluar y ejecutar el proyecto.

Fuentes: Código actual, README.md, backend/POSTGRESQL.md, ANDROID.md y límites documentados en esta entrega.
