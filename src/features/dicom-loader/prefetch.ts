import { cache, metaData } from '@cornerstonejs/core';
import { prefetchPart10Instance, wadouri } from '@cornerstonejs/dicom-image-loader';
import { Enums as MetadataEnums } from '@cornerstonejs/metadata';
import type { DicomSeries } from './series';

const PREFETCH_CONCURRENCY = 4;
const NATURALIZED = MetadataEnums.MetadataModules.NATURALIZED;

const baseOf = (imageId: string) => imageId.split('?')[0];
const hasMetadata = (imageId: string) => Boolean(metaData.get(NATURALIZED, baseOf(imageId)));

/**
 * Pastikan metadata Part 10 satu instance sudah ada di cache Cornerstone. Aman dipanggil bersamaan
 * dari beberapa tempat (thumbnail, MPR): penambahan yang sedang berjalan dipakai ulang, dan
 * pemuatan gambar yang sedang berlangsung ditunggu karena loader mengisi metadata sendiri.
 * Tanpa ini, dua penambahan untuk file yang sama memicu peringatan "Metadata add skipped".
 */
export async function ensureInstanceMetadata(imageId: string, file?: Blob): Promise<void> {
  await cache.getImageLoadObject(imageId)?.promise.catch(() => undefined);
  // Pemeriksaan dan penambahan harus berurutan tanpa `await` di antaranya.
  if (hasMetadata(imageId)) return;
  const base = baseOf(imageId);
  const source = file ?? wadouri.fileManager.get(Number(base.slice(base.indexOf(':') + 1)));
  if (source) await prefetchPart10Instance(base, () => source.arrayBuffer());
}

/**
 * Pastikan metadata Cornerstone (pixel module, geometri, dsb.) tersedia untuk semua irisan.
 * Untuk file lokal metadata baru ada setelah file dibaca loader, padahal pembuatan volume
 * membutuhkannya di awal. Jalurnya sama dengan loader (`addDicomPart10Instance`), jadi
 * file tidak dibaca dua kali saat pikselnya dimuat.
 */
export async function prefetchSeriesMetadata(
  series: DicomSeries,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const pending = series.instances
    .map((instance, k) => ({ file: instance.file, imageId: series.baseImageIds[k] }))
    .filter(({ imageId }) => !hasMetadata(imageId));

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const { file, imageId } = pending[next++];
      await ensureInstanceMetadata(imageId, file);
      onProgress?.(++done, pending.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, pending.length) }, worker));
}
