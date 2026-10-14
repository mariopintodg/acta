// Copia la app web (la misma que se publica en Netlify) a www/ para empaquetarla dentro de la app nativa.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const files = ['index.html', 'privacidad.html', 'app.css', 'app.js', 'h2i.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png'];
rmSync('www', { recursive: true, force: true }); mkdirSync('www');
for (const f of files) if (existsSync(f)) cpSync(f, 'www/' + f);
console.log('www listo:', files.length, 'archivos');
