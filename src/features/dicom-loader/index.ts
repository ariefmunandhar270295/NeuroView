import { parseDicomHeader, type DicomInstance } from './parseHeader';
import { buildSeries, groupByStudy, type DicomStudy } from './series';
import { filesFromDataTransfer } from './collectFiles';
import { isIOS } from '../../shared/platform';

export { ensureInstanceMetadata, prefetchSeriesMetadata } from './prefetch';
export { releaseStudies } from './release';
export type { DicomInstance } from './parseHeader';
export type { DicomSeries, DicomStudy, SlicePlane } from './series';

export interface LoadResult {
  studies: DicomStudy[];
  /** Jumlah file yang dilewati (bukan DICOM atau tanpa citra). */
  skipped: number;
}

export type ProgressCallback = (done: number, total: number) => void;

const PARSE_CONCURRENCY = 8;

/** Parse header semua file secara lokal lalu kelompokkan menjadi Study → Series yang siap ditampilkan. */
export async function loadDicomFiles(files: File[], onProgress?: ProgressCallback): Promise<LoadResult> {
  const instances: DicomInstance[] = [];
  let done = 0;
  let next = 0;

  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const instance = await parseDicomHeader(file);
      if (instance) instances.push(instance);
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARSE_CONCURRENCY, files.length) }, worker));

  return { studies: groupByStudy(buildSeries(instances)), skipped: files.length - instances.length };
}

export interface DicomInputOptions {
  /** Elemen yang menerima drag & drop file/folder. */
  dropTarget: HTMLElement;
  onFiles: (files: File[]) => void;
}

function createPicker(label: string, directory: boolean, onFiles: (files: File[]) => void): HTMLLabelElement {
  const button = document.createElement('label');
  button.className = 'btn';
  button.textContent = label;

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  // Tanpa `accept`: banyak file DICOM tidak berekstensi dan akan tersaring oleh picker iOS.
  if (directory) input.webkitdirectory = true;
  input.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });

  button.append(input);
  return button;
}

/**
 * Tombol "Buka Folder DICOM" (`webkitdirectory`), "Buka File", dan drag & drop.
 * Safari iOS tidak mendukung `webkitdirectory`, jadi di iPad hanya "Buka File" (multi-select) yang tampil.
 */
export function createDicomInput({ dropTarget, onFiles }: DicomInputOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'dicom-input';
  if (!isIOS) container.append(createPicker('Buka Folder DICOM', true, onFiles));
  container.append(createPicker('Buka File', false, onFiles));

  // Hitung enter/leave karena event juga terpicu saat kursor melewati elemen anak.
  let dragDepth = 0;
  dropTarget.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (++dragDepth === 1) dropTarget.classList.add('is-dragover');
  });
  dropTarget.addEventListener('dragover', (event) => event.preventDefault());
  dropTarget.addEventListener('dragleave', () => {
    if (--dragDepth === 0) dropTarget.classList.remove('is-dragover');
  });
  dropTarget.addEventListener('drop', async (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropTarget.classList.remove('is-dragover');
    if (!event.dataTransfer) return;
    const files = await filesFromDataTransfer(event.dataTransfer);
    if (files.length) onFiles(files);
  });

  return container;
}
