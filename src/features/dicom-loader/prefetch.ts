import { metaData } from '@cornerstonejs/core';
import { prefetchPart10Instance } from '@cornerstonejs/dicom-image-loader';
import type { DicomSeries } from './series';

const PREFETCH_CONCURRENCY = 4;

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
    .filter(({ imageId }) => !metaData.get('imagePixelModule', imageId));

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const { file, imageId } = pending[next++];
      await prefetchPart10Instance(imageId, () => file.arrayBuffer());
      onProgress?.(++done, pending.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, pending.length) }, worker));
}
