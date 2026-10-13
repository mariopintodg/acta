# Acta

Grabadora de reuniones que convierte cada conversación en un acta visual: transcripción con hablantes, resumen, decisiones, tareas, riesgos, ideas, mapa mental, brief del proyecto y un chat para preguntarle a la reunión.

## Cómo funciona

1. **Grabar**: usa el micrófono del celular, con marcas de momentos importantes y notas con su minuto. El audio se guarda cada pocos segundos, así que si la app se cierra la grabación se puede recuperar.
2. **Transcribir**: OpenAI (`gpt-4o-transcribe-diarize`) transcribe e identifica quién habla. Las grabaciones largas se dividen solas en partes de 55 minutos para respetar el límite de 25 MB.
3. **Analizar**: Claude (Anthropic) arma el acta estructurada y le pone nombre a cada voz cuando se puede deducir.

Todo se guarda en el dispositivo (IndexedDB). No hay servidor propio: la app llama directo a OpenAI y Anthropic con las claves del usuario, guardadas solo en ese navegador.

## Publicar

Es un sitio estático. Basta con servir esta carpeta por HTTPS (por ejemplo, GitHub Pages desde la rama `main`). El micrófono y la instalación como app requieren HTTPS.

## Instalar en el celular

- iPhone (Safari): Compartir → Agregar a pantalla de inicio.
- Android (Chrome): menú ⋮ → Instalar aplicación.

## Archivos

- `index.html`: estructura y navegación.
- `css/app.css`: sistema de diseño (tokens de color, tipografía, modo claro y oscuro).
- `js/app.js`: grabadora, almacenamiento, transcripción, análisis y vistas.
- `sw.js`: funcionamiento sin conexión.
- `manifest.webmanifest` e `icons/`: instalación como app.
