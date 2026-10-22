// Copia la app web (la misma que se publica en Netlify) a www/ para empaquetarla dentro de la app nativa.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const files = ['index.html', 'privacidad.html', 'app.css', 'app.js', 'h2i.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png'];
rmSync('www', { recursive: true, force: true }); mkdirSync('www');
for (const f of files) if (existsSync(f)) cpSync(f, 'www/' + f);
/* Tipografías propias: sin ellas los PDF y la app se ven con otra letra */
if (existsSync('fonts')) cpSync('fonts', 'www/fonts', { recursive: true });
/* Ruta Maestra dentro de la app: así se abre y vuelve sin salir a la web */
if (existsSync('obra')) cpSync('obra', 'www/obra', { recursive: true });
console.log('www listo:', files.length, 'archivos');
