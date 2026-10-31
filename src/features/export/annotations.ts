import { annotation, AngleTool, LengthTool, ProbeTool } from '@cornerstonejs/tools';
import type { DicomStudy } from '../dicom-loader';
import { CLINICAL_DISCLAIMER } from '../../shared/disclaimer';

/** Lokasi citra suatu imageId Cornerstone, tanpa data pasien. */
export interface ImageReference {
  seriesInstanceUID: string;
  sopInstanceUID: string;
  /** Nomor frame (1-based) untuk objek multi-frame. */
  frame?: number;
}

/** Indeks imageId (`dicomfile:N[?frame=M]`) → UID series/instance, dibangun dari hasil loader. */
export function createImageIndex(studies: DicomStudy[]): (imageId: string) => ImageReference | undefined {
  const index = new Map<string, ImageReference>();
  for (const series of studies.flatMap((s) => s.series)) {
    series.instances.forEach((instance, k) => {
      const base = series.baseImageIds[k];
      const ref = { seriesInstanceUID: series.seriesInstanceUID, sopInstanceUID: instance.sopInstanceUID };
      if (instance.numberOfFrames === 1) index.set(base, ref);
      else for (let f = 1; f <= instance.numberOfFrames; f++) index.set(`${base}?frame=${f}`, { ...ref, frame: f });
    });
  }
  return (imageId) => index.get(imageId);
}

const MEASUREMENT_TOOLS = new Set<string>([LengthTool.toolName, AngleTool.toolName, ProbeTool.toolName]);
const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

interface MeasurementData {
  handles?: { points?: number[][] };
  label?: string;
  cachedStats?: Record<string, Record<string, unknown>>;
}

/** Nilai terukur dari cache statistik Cornerstone (diambil dari target pertama yang berisi angka). */
function measuredValue(toolName: string, stats: Record<string, Record<string, unknown>> = {}) {
  for (const s of Object.values(stats)) {
    if (toolName === LengthTool.toolName && typeof s.length === 'number') {
      return { length: round(s.length), unit: String(s.unit ?? 'mm') };
    }
    if (toolName === AngleTool.toolName && typeof s.angle === 'number') return { angleDeg: round(s.angle) };
    if (toolName === ProbeTool.toolName && s.value !== undefined && s.value !== null) {
      return { value: s.value, unit: s.modalityUnit ?? null, modality: s.Modality ?? null };
    }
  }
  return null;
}

/**
 * Semua pengukuran (Jarak, Sudut, Probe) dari state anotasi Cornerstone sebagai objek JSON:
 * titik dalam koordinat pasien LPS (mm), nilai terukur, dan referensi citra (UID, tanpa data
 * pasien). Rencana trajektori ikut disertakan bila ada.
 */
export function exportAnnotations(describeImage: (imageId: string) => ImageReference | undefined, trajectoryPlan?: unknown) {
  const measurements = annotation.state
    .getAllAnnotations()
    .flatMap((a) => {
      const metadata = a.metadata;
      if (!metadata || !MEASUREMENT_TOOLS.has(metadata.toolName)) return [];
      const data = a.data as MeasurementData;
      const imageId = metadata.referencedImageId;
      return [
        {
          tool: metadata.toolName,
          label: data.label || null,
          frameOfReferenceUID: metadata.FrameOfReferenceUID ?? null,
          image: imageId ? (describeImage(imageId) ?? null) : null,
          pointsLps: (data.handles?.points ?? []).map((p) => p.map((v) => round(v))),
          value: measuredValue(metadata.toolName, data.cachedStats),
        },
      ];
    });

  return {
    format: 'neuroviewer-annotations',
    version: 1,
    createdAt: new Date().toISOString(),
    disclaimer: CLINICAL_DISCLAIMER,
    coordinateSystem: 'Koordinat pasien DICOM (LPS: +x kiri, +y posterior, +z superior), mm',
    measurements,
    trajectoryPlan: trajectoryPlan ?? null,
  };
}
