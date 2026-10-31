import { Zip, ZipPassThrough } from 'fflate';
import type { DicomSeries, DicomStudy } from '../dicom-loader';
import { downloadBlob, fileTimestamp } from '../../shared/download';
import { CLINICAL_DISCLAIMER } from '../../shared/disclaimer';
import { ANONYMIZED_FIELDS, anonymizeDicom, createPseudonym } from './anonymize';

export interface AnonymizerOptions {
  /** Series yang sedang tampil dan study-nya, atau undefined bila belum ada data. */
  getSelection: () => { series: DicomSeries; study: DicomStudy } | undefined;
  onMessage: (text: string) => void;
}

const NOT_CHANGED = [
  'Tanggal & jam study/series',
  'UID (study, series, instance)',
  'Deskripsi study/series dan tag lain',
  'Tag privat vendor dan isi sequence',
  'Teks yang tertanam di piksel gambar (burned-in)',
];

interface ZipItem {
  path: string;
  file: File;
}

function readme(pseudonym: string, count: number): string {
  return [
    'Dianonimkan dengan NeuroViewer (anonimisasi dasar, di browser).',
    CLINICAL_DISCLAIMER,
    '',
    `Jumlah file: ${count}. PatientID diganti pseudonim: ${pseudonym}.`,
    '',
    'Diubah:',
    ...ANONYMIZED_FIELDS.replaced.map((f) => `- ${f}`),
    ...ANONYMIZED_FIELDS.emptied.map((f) => `- ${f} dikosongkan`),
    ...ANONYMIZED_FIELDS.removed.map((f) => `- ${f} dihapus`),
    '',
    'TIDAK diubah:',
    ...NOT_CHANGED.map((f) => `- ${f}`),
    '',
    'Ini bukan de-identifikasi lengkap menurut DICOM PS3.15. Periksa sebelum dibagikan.',
    '',
  ].join('\n');
}

/** Anonimkan file satu per satu lalu masukkan ke ZIP (tanpa kompresi) secara streaming. */
async function buildZip(
  items: ZipItem[],
  pseudonym: string,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<Blob> {
  const chunks: BlobPart[] = [];
  let resolve!: (blob: Blob) => void;
  let reject!: (error: unknown) => void;
  const finished = new Promise<Blob>((res, rej) => ((resolve = res), (reject = rej)));
  const zip = new Zip((error, chunk, final) => {
    if (error) return reject(error);
    chunks.push(chunk as BlobPart);
    if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
  });
  const add = (path: string, bytes: Uint8Array) => {
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(bytes, true);
  };

  for (const [i, { path, file }] of items.entries()) {
    if (isCancelled()) {
      zip.terminate();
      throw new Error('Dibatalkan.');
    }
    try {
      add(path, new Uint8Array(anonymizeDicom(await file.arrayBuffer(), pseudonym)));
    } catch (error) {
      zip.terminate();
      throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    onProgress(i + 1, items.length);
  }
  add('neuroviewer-anonim/BACA-SAYA.txt', new TextEncoder().encode(readme(pseudonym, items.length)));
  zip.end();
  return finished;
}

function zipItems(seriesList: DicomSeries[]): ZipItem[] {
  // Nama folder dari nomor series & modalitas saja: deskripsi bisa memuat informasi pasien.
  return seriesList.flatMap((series, s) => {
    const folder = `S${String(series.seriesNumber ?? s + 1).padStart(3, '0')}-${series.modality || 'OT'}`;
    return series.instances.map((instance, i) => ({
      path: `neuroviewer-anonim/${folder}/IM${String(i + 1).padStart(4, '0')}.dcm`,
      file: instance.file,
    }));
  });
}

/**
 * Dialog "Anonimkan & unduh DICOM": PatientName/ID diganti, tanggal lahir dikosongkan, data
 * institusi & identitas pasien lain dihapus (dcmjs), lalu diunduh sebagai ZIP. Semua proses di
 * browser. Satu file gagal diverifikasi → seluruh unduhan dibatalkan.
 */
export function createAnonymizer({ getSelection, onMessage }: AnonymizerOptions) {
  const dialog = Object.assign(document.createElement('dialog'), { className: 'anon-dialog' });
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  dialog.innerHTML = `
    <h2>Anonimkan &amp; unduh DICOM</h2>
    <fieldset class="anon-scope">
      <legend>Cakupan</legend>
      <label><input type="radio" name="anon-scope" value="series" checked /> <span data-label="series"></span></label>
      <label><input type="radio" name="anon-scope" value="study" /> <span data-label="study"></span></label>
    </fieldset>
    <div class="anon-columns">
      <div><h3>Diubah</h3>${list([
        ...ANONYMIZED_FIELDS.replaced,
        ...ANONYMIZED_FIELDS.emptied.map((f) => `${f} dikosongkan`),
        `Dihapus: ${ANONYMIZED_FIELDS.removed.join(', ')}`,
      ])}</div>
      <div><h3>Tidak diubah</h3>${list(NOT_CHANGED)}</div>
    </div>
    <p class="anon-warning">⚠ Bukan de-identifikasi lengkap (DICOM PS3.15). Periksa hasilnya sebelum dibagikan.</p>
    <p class="anon-progress" role="status" aria-live="polite"></p>
    <div class="anon-actions">
      <button type="button" class="btn" data-action="cancel">Batal</button>
      <button type="button" class="btn btn-primary" data-action="start">Unduh ZIP</button>
    </div>`;
  document.body.append(dialog);

  const progress = dialog.querySelector<HTMLElement>('.anon-progress')!;
  const startButton = dialog.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  const radios = [...dialog.querySelectorAll<HTMLInputElement>('input[name="anon-scope"]')];
  let running = false;
  let cancelled = false;

  dialog.querySelector('[data-action="cancel"]')!.addEventListener('click', () => {
    if (running) cancelled = true;
    else dialog.close();
  });
  // Esc saat proses berjalan = batalkan proses, bukan menutup dialog di tengah jalan.
  dialog.addEventListener('cancel', (event) => {
    if (running) {
      event.preventDefault();
      cancelled = true;
    }
  });

  startButton.addEventListener('click', async () => {
    const selection = getSelection();
    if (!selection) return;
    const scope = radios.find((r) => r.checked)?.value === 'study' ? selection.study.series : [selection.series];
    const items = zipItems(scope);
    const pseudonym = createPseudonym();
    running = true;
    cancelled = false;
    startButton.disabled = true;
    radios.forEach((r) => (r.disabled = true));
    progress.classList.remove('is-error');
    try {
      const blob = await buildZip(
        items,
        pseudonym,
        (done, total) => (progress.textContent = `Menganonimkan ${done}/${total} file…`),
        () => cancelled,
      );
      downloadBlob(blob, `neuroviewer-anonim-${fileTimestamp()}.zip`);
      onMessage(`${items.length} file DICOM dianonimkan (PatientID → ${pseudonym}) dan diunduh sebagai ZIP.`);
      dialog.close();
    } catch (error) {
      console.error(error);
      progress.classList.add('is-error');
      progress.textContent = `Gagal, tidak ada file yang diunduh. ${error instanceof Error ? error.message : ''}`;
    } finally {
      running = false;
      startButton.disabled = false;
      radios.forEach((r) => (r.disabled = false));
    }
  });

  return {
    open() {
      const selection = getSelection();
      if (!selection) {
        onMessage('Belum ada series untuk dianonimkan.');
        return;
      }
      const studyFiles = selection.study.series.reduce((n, s) => n + s.instances.length, 0);
      dialog.querySelector('[data-label="series"]')!.textContent =
        `Series yang sedang tampil (${selection.series.instances.length} file)`;
      dialog.querySelector('[data-label="study"]')!.textContent =
        `Seluruh study (${selection.study.series.length} series, ${studyFiles} file)`;
      progress.textContent = '';
      progress.classList.remove('is-error');
      dialog.showModal();
    },
  };
}
