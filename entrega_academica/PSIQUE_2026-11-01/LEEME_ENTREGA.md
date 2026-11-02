# Entrega académica de PSIQUE

Instituto Juan Amós Comenio. Carrera: Analista de Sistemas. Materia: Proyecto Final.
Autor: Franco José Caudeli. Docente: Julián Speciale.
Edición: 1 de noviembre de 2026, zona horaria de Buenos Aires.

## Documentos para evaluar y utilizar el proyecto

| Archivo | Extensión | Contenido |
| --- | --- | --- |
| Documentacion_Funcional_PSIQUE.pdf | 21 páginas A4 | Alcance actual, guía de uso, pantallas, reglas, casos de uso y límites. |
| Documentacion_Tecnica_PSIQUE.pdf | 30 páginas A4 | Arquitectura, versiones, API, diccionario y ER, migraciones, seguridad, instalación y pruebas. |
| Presentacion_PSIQUE.pdf | 15 diapositivas 16:9 | Exposición visual con capturas reales, diagramas y resultados comprobados. |

Los dos informes contienen índice enlazado y marcadores de navegación. La presentación está preparada para pantalla completa, con textos breves. El guion de exposición complementa las diapositivas sin recargarlas.

## Fuentes editables

- `fuentes/Documentacion_Funcional_PSIQUE.md` y `Documentacion_Tecnica_PSIQUE.md`: contenido completo de los informes. `<!-- PAGE -->` define los cortes de página de esta edición.
- `fuentes/presentacion.json`: títulos, contenido y notas de las 15 diapositivas.
- `fuentes/Presentacion_PSIQUE.html`: versión navegable y autocontenida, para abrir localmente. Flechas o botones cambian de diapositiva.
- `fuentes/diapositivas/*.svg`: fuentes vectoriales individuales, con texto editable y capturas reales incrustadas. Pueden abrirse con un editor SVG.
- `fuentes/Guion_Presentacion_PSIQUE.md`: explicación oral y fuentes por diapositiva.
- `recursos/diagramas/`: arquitectura, autenticación, ER completo y resumido, y conexión Android. Se incluyen SVG y coordenadas JSON editables.
- `fuentes/generar_entrega.py`: regenera los PDF, los diagramas, las diapositivas SVG, HTML y el guion. No accede a la aplicación ni a PostgreSQL.
- `fuentes/verificar_pdf.py`: comprueba y renderiza todas las páginas para revisión.

El formato principal es PDF. Las fuentes conservadas son Markdown, JSON, HTML, SVG y Python, con contenido y gráficos editables. No se necesita PowerPoint para abrir o regenerar la presentación.

## Regenerar los documentos

Utilizar Python 3.14, como en esta edición, y un entorno de documentación separado de las dependencias de PSIQUE. Desde esta carpeta:

```powershell
py -m venv .venv-documentos
.\.venv-documentos\Scripts\python.exe -m pip install -r fuentes\requirements.txt
.\.venv-documentos\Scripts\python.exe fuentes\generar_entrega.py
```

Windows utiliza Segoe UI o Arial del sistema. El generador usa Vera de ReportLab como alternativa si esas fuentes no están disponibles; un cambio de tipografía exige revisar nuevamente la maquetación. Las fuentes de los PDF están incorporadas, salvo la tipografía PDF estándar utilizada en ejemplos de código.

Para renderizar y comprobar:

```powershell
.\.venv-documentos\Scripts\python.exe -m pip install -r fuentes\requirements-verificacion.txt
.\.venv-documentos\Scripts\python.exe fuentes\verificar_pdf.py
```

Los PNG de revisión se generan en `_revision/`, o en la ruta indicada por `PSIQUE_REVISION_DIR`. Son intermediarios y no se necesitan para leer la entrega. La verificación automatizada no sustituye la inspección visual de cada página.

## Capturas y evidencia

`recursos/capturas/` contiene 18 capturas originales del APK instalado en el emulador y sus recortes. Las tomas verticales usan 411 × 914 píxeles CSS y las ampliadas 1600 × 1000. La ampliación cambia el tamaño de la pantalla del emulador, sin sustituir la interfaz. Los recortes no cambian datos ni elementos: `evidencias/recortes.json` identifica origen y coordenadas.

La cuenta y los pacientes son ficticios. Las capturas de esta entrega utilizan una API aislada en el puerto 3001, conectada a `psique_test`. El túnel ADB del dispositivo redirigió temporalmente su puerto 3000 a esa instancia y se restauró al terminar. El backend habitual no se detuvo ni se utilizó para crear demostraciones. El correo fue simulado en memoria. La cuenta ficticia y sus registros se retiraron al finalizar.

Los logs de pruebas, compilación y firma del APK están en `evidencias/`. Las horas ISO de esos archivos se expresan en UTC y pueden corresponder al 2 de noviembre mientras en Buenos Aires todavía era 1 de noviembre. Las cantidades históricas de otras etapas no se suman a las suites actuales.

## Ejecución de PSIQUE

La documentación técnica explica instalación en una PC nueva y ejecución sin depender del almacén privado del autor. El repositorio de PSIQUE sigue siendo necesario para instalar y ejecutar el software. Esta carpeta no contiene credenciales, `.env`, bases ni código compilado del backend.

El APK de depuración generado está en `android/app/build/outputs/apk/debug/app-debug.apk` dentro del proyecto. No se duplicó en la carpeta documental. Su hash comprobado se incluye en el informe técnico y la evidencia. El modo local necesita Express, PostgreSQL y ADB reverse; no acredita funcionamiento completo fuera de la computadora.

No hay despliegue remoto, prueba en teléfono físico ni aprobación para uso clínico productivo. No se localizó una consigna original independiente: se utilizaron el requerimiento formal de esta entrega, los datos académicos confirmados y el sistema actual. No se inventaron datos institucionales ni requisitos de evaluación.
