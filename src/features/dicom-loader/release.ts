import { cache } from '@cornerstonejs/core';
import { wadouri } from '@cornerstonejs/dicom-image-loader';
import { utilities as metadataUtilities } from '@cornerstonejs/metadata';
import { annotation } from '@cornerstonejs/tools';
import type { DicomStudy } from './series';

/**
 * Lepaskan data batch sebelumnya saat file baru dibuka, agar memori tidak menumpuk:
 * gambar ter-decode di cache Cornerstone, cache metadata (termasuk buffer file utuh hasil
 * parsing loader), referensi File di file manager, dan anotasi pengukuran yang merujuk gambar
 * tersebut. Volume MPR dilepas oleh mpr-viewer (`releaseVolume`).
 */
export function releaseStudies(studies: DicomStudy[]): void {
  const imageIds = new Set(studies.flatMap((study) => study.series.flatMap((series) => series.imageIds)));

  for (const a of annotation.state.getAllAnnotations()) {
    const ref = a.metadata?.referencedImageId;
    if (ref && imageIds.has(ref) && a.annotationUID) annotation.state.removeAnnotation(a.annotationUID);
  }

  for (const imageId of imageIds) {
    // removeImageLoadObject melempar error bila imageId tidak ada di cache.
    if (cache.getImageLoadObject(imageId) || cache.getImage(imageId)) {
      cache.removeImageLoadObject(imageId, { force: true });
    }
  }

  // Indeks file manager tidak dipakai ulang (bukan purge), agar imageId lama tidak pernah
  // menunjuk ke file baru.
  for (const series of studies.flatMap((study) => study.series)) {
    for (const base of series.baseImageIds) wadouri.fileManager.remove(Number(base.slice(base.indexOf(':') + 1)));
  }

  // Seluruh batch diganti; metadata batch baru belum dibaca loader, jadi aman dikosongkan total.
  metadataUtilities.clearCacheData();
}
