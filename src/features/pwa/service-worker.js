/*
 * Service worker NeuroViewer. Template ini diisi saat build oleh `vite-plugin.ts`:
 * daftar file aplikasi (`__NV_ASSETS__`) dan versi berbasis isi file (`__NV_VERSION__`).
 *
 * Hanya file aplikasi (HTML, JS, CSS, WASM codec, ikon) yang disimpan. Data DICOM dibaca langsung
 * dari File di browser dan tidak pernah lewat jaringan, jadi tidak pernah masuk cache ini.
 */
const VERSION = '__NV_VERSION__';
const ASSETS = '__NV_ASSETS__';

const PREFIX = 'neuroviewer-';
const CACHE = PREFIX + VERSION;
const scope = new URL(self.registration.scope);
const SHELL = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  // `cache: 'reload'` melewati cache HTTP (mis. GitHub Pages max-age) agar isi sesuai versi ini.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((path) => new Request(new URL(path, scope), { cache: 'reload' })))),
  );
  // Tidak memanggil skipWaiting di sini: versi baru menunggu persetujuan pengguna (lihat 'message'),
  // karena memuat ulang halaman menutup data DICOM yang sedang dibuka.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      // Instalasi pertama: langsung kendalikan halaman agar codec yang dimuat belakangan juga dari cache.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Hanya file aplikasi sendiri; request lain tidak disentuh.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const path = url.origin + url.pathname;
  const isShell = request.mode === 'navigate' && (path === scope.href || path === SHELL);
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(isShell ? SHELL : request))
      .then((cached) => cached || fetch(request)),
  );
});
