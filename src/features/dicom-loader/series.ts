import { wadouri } from '@cornerstonejs/dicom-image-loader';
import type { DicomInstance } from './parseHeader';

export interface DicomSeries {
  seriesInstanceUID: string;
  studyInstanceUID: string;
  modality: string;
  description: string;
  seriesNumber?: number;
  instances: DicomInstance[];
  /** imageId Cornerstone (`dicomfile:N[?frame=M]`), urut sesuai posisi irisan. */
  imageIds: string[];
}

function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Urutkan berdasarkan posisi sepanjang normal bidang irisan (IPP · normal),
 * fallback ke InstanceNumber bila geometri tidak lengkap.
 */
function sortInstances(instances: DicomInstance[]): DicomInstance[] {
  const iop = instances[0]?.imageOrientationPatient;
  const hasGeometry = !!iop && instances.every((i) => i.imagePositionPatient && i.imageOrientationPatient);

  if (hasGeometry) {
    const normal = cross(iop.slice(0, 3), iop.slice(3, 6));
    return [...instances].sort(
      (a, b) => dot(a.imagePositionPatient!, normal) - dot(b.imagePositionPatient!, normal),
    );
  }

  return [...instances].sort(
    (a, b) =>
      (a.instanceNumber ?? 0) - (b.instanceNumber ?? 0) ||
      a.file.name.localeCompare(b.file.name, undefined, { numeric: true }),
  );
}

function toImageIds(instances: DicomInstance[]): string[] {
  return instances.flatMap((instance) => {
    const imageId = wadouri.fileManager.add(instance.file);
    if (instance.numberOfFrames === 1) return [imageId];
    return Array.from({ length: instance.numberOfFrames }, (_, i) => `${imageId}?frame=${i + 1}`);
  });
}

/** Kelompokkan instance per SeriesInstanceUID dan daftarkan file ke file manager Cornerstone. */
export function buildSeries(instances: DicomInstance[]): DicomSeries[] {
  const bySeries = new Map<string, DicomInstance[]>();
  const seen = new Set<string>();

  for (const instance of instances) {
    // File yang sama bisa terpilih dua kali (mis. folder + file); abaikan duplikat SOP.
    if (instance.sopInstanceUID) {
      if (seen.has(instance.sopInstanceUID)) continue;
      seen.add(instance.sopInstanceUID);
    }
    const group = bySeries.get(instance.seriesInstanceUID);
    if (group) group.push(instance);
    else bySeries.set(instance.seriesInstanceUID, [instance]);
  }

  return [...bySeries.values()]
    .map((group) => {
      const sorted = sortInstances(group);
      const ref = sorted[0];
      return {
        seriesInstanceUID: ref.seriesInstanceUID,
        studyInstanceUID: ref.studyInstanceUID,
        modality: ref.modality,
        description: ref.seriesDescription,
        seriesNumber: ref.seriesNumber,
        instances: sorted,
        imageIds: toImageIds(sorted),
      };
    })
    .sort((a, b) => (a.seriesNumber ?? Infinity) - (b.seriesNumber ?? Infinity));
}
