// Arma el sitio completo para Cloudflare Pages en dist/:
//   /         → página de presentación (site/)
//   /app/     → la app Acta
// Ambas en el mismo dominio, así los datos guardados en el teléfono se mantienen.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true }); mkdirSync('dist/app', { recursive: true });
cpSync('site', 'dist', { recursive: true });
for (const f of ['privacidad.html', '_headers', '_redirects', 'assetlinks.json', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) cpSync(f, 'dist/' + f);
for (const f of ['index.html', 'privacidad.html', 'app.css', 'app.js', 'h2i.js', 'sw.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png']) cpSync(f, 'dist/app/' + f);
cpSync('fonts', 'dist/app/fonts', { recursive: true });
// Ruta Maestra (presupuesto y programa de obra) en /obra/, mismo dominio que la app para recibir el plan sin archivos.
if (existsSync('obra')) cpSync('obra', 'dist/obra', { recursive: true });
// El service worker antiguo vivía en la raíz y guardaba la app ahí: este lo reemplaza y se retira solo.
writeFileSync('dist/sw.js', `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.registration.unregister();
  const list = await self.clients.matchAll({ type: 'window' });
  list.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
})()));
`);
console.log('dist listo');
