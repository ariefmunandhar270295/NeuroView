import { defineConfig } from 'vite';
import { pwaServiceWorker } from './src/features/pwa/vite-plugin';

/**
 * GitHub Pages proyek disajikan di https://<user>.github.io/<nama-repo>/, jadi base build = nama repo.
 * Di GitHub Actions, `BASE_PATH` diisi dari konfigurasi Pages (lihat .github/workflows/deploy-pages.yml),
 * sehingga tetap benar bila repo diganti nama atau memakai domain kustom (base `/`).
 */
const REPO_BASE = '/NeuroView/';

function buildBase(): string {
  const fromEnv = process.env.BASE_PATH?.trim();
  if (!fromEnv) return REPO_BASE;
  // Pastikan diawali dan diakhiri satu `/`, mis. "/NeuroView" → "/NeuroView/".
  return `/${fromEnv}/`.replace(/\/{2,}/g, '/');
}

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` berjalan dengan command 'serve'; base-nya harus sama dengan build.
  base: command === 'build' || isPreview ? buildBase() : '/',
  // Service worker untuk offline/PWA, dibuat dari isi folder output (lihat src/features/pwa).
  plugins: [pwaServiceWorker()],
  optimizeDeps: {
    // Loader memuat worker dan codec WASM lewat `new URL(..., import.meta.url)`;
    // pre-bundling memutus path tersebut.
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      // Dependensi loader yang juga dipakai core/tools: harus satu instance (registry metadata,
      // cache, dsb.), jadi di-prebundle bersama alih-alih ditemukan saat runtime.
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/metadata',
      '@cornerstonejs/utils',
      'dicom-parser',
      'comlink',
      'pako',
      'uuid',
      // Codec emscripten berformat CommonJS; perlu dikonversi ke ESM untuk dev server.
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
}));
