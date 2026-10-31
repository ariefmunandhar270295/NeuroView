import { downloadBlob, fileTimestamp } from '../../shared/download';
import { CLINICAL_DISCLAIMER } from '../../shared/disclaimer';
import { exportAnnotations, type ImageReference } from './annotations';
import { captureViewportPng } from './screenshot';

export { createImageIndex } from './annotations';
export type { ImageReference } from './annotations';

export interface ExportMenuOptions {
  /** Elemen viewport yang sedang terlihat (1×1: stack, 2×2: grid MPR), atau undefined bila kosong. */
  getCaptureElement: () => HTMLElement | undefined;
  describeImage: (imageId: string) => ImageReference | undefined;
  /** Rencana trajektori (JSON) untuk ikut diekspor, bila ada. */
  getTrajectoryPlan: () => unknown;
  onMessage: (text: string) => void;
}

export interface ExportMenu {
  element: HTMLElement;
  /** Tambah aksi lain ke menu (mis. anonimisasi DICOM). */
  addItem(label: string, title: string, onClick: () => void): void;
}

/** Menu "Ekspor" di header: screenshot viewport ke PNG dan anotasi/trajektori ke JSON. */
export function createExportMenu({ getCaptureElement, describeImage, getTrajectoryPlan, onMessage }: ExportMenuOptions): ExportMenu {
  const element = document.createElement('details');
  element.className = 'export-menu';
  const summary = Object.assign(document.createElement('summary'), { className: 'btn', textContent: 'Ekspor' });
  const panel = Object.assign(document.createElement('div'), { className: 'menu-panel' });
  panel.setAttribute('role', 'menu');
  element.append(summary, panel);

  // Tutup saat klik di luar menu.
  document.addEventListener('click', (event) => {
    if (element.open && !element.contains(event.target as Node)) element.open = false;
  });

  function addItem(label: string, title: string, onClick: () => void) {
    const item = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-item', textContent: label, title });
    item.setAttribute('role', 'menuitem');
    item.addEventListener('click', () => {
      element.open = false;
      onClick();
    });
    panel.append(item);
  }

  addItem('Screenshot PNG', 'Simpan tampilan viewport (termasuk overlay & anotasi) sebagai PNG', async () => {
    const target = getCaptureElement();
    if (!target) {
      onMessage('Belum ada gambar untuk di-screenshot.');
      return;
    }
    try {
      const blob = await captureViewportPng(target, `NeuroViewer · ${CLINICAL_DISCLAIMER} · ${new Date().toLocaleString('id-ID')}`);
      downloadBlob(blob, `neuroviewer-${fileTimestamp()}.png`);
      onMessage('Screenshot disimpan sebagai PNG.');
    } catch (error) {
      console.error(error);
      onMessage('Gagal membuat screenshot.');
    }
  });

  addItem('Anotasi & trajektori (JSON)', 'Pengukuran (jarak, sudut, probe) dan rencana trajektori', () => {
    const json = exportAnnotations(describeImage, getTrajectoryPlan());
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `neuroviewer-anotasi-${fileTimestamp()}.json`);
    onMessage(`Anotasi diekspor: ${json.measurements.length} pengukuran${json.trajectoryPlan ? ' + rencana trajektori' : ''}.`);
  });

  return { element, addItem };
}
