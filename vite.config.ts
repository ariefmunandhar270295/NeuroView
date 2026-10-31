import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Build memakai path relatif agar bisa disajikan dari subpath, mis. GitHub Pages
  // (https://<user>.github.io/NeuroView/), tanpa mengikat nama repo.
  base: command === 'build' ? './' : '/',
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
