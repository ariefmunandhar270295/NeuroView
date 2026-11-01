import { init as initCore } from '@cornerstonejs/core';
import { init as initTools } from '@cornerstonejs/tools';
import { init as initDicomImageLoader } from '@cornerstonejs/dicom-image-loader';

let initialized = false;

/**
 * Inisialisasi Cornerstone3D (core, tools, DICOM image loader) satu kali.
 * Seluruh decoding berjalan di web worker milik browser — tidak ada request ke server.
 */
export function initCornerstone(): void {
  if (initialized) return;

  initCore();
  initDicomImageLoader({
    // iPad punya memori terbatas; batasi worker agar tidak kehabisan RAM saat decode.
    maxWebWorkers: Math.min(navigator.hardwareConcurrency || 1, 4),
  });
  initTools();

  initialized = true;
}
