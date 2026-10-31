import { data as dcmjsData, log as dcmjsLog, type DicomDataset } from 'dcmjs';

// VR ambigu (xs/ox) wajar pada implicit VR; validasinya tidak relevan untuk membaca header.
dcmjsLog.getLogger('validation.dcmjs').setLevel('silent');

/** Metadata minimal satu instance DICOM yang dibutuhkan untuk mengelompokkan dan mengurutkan series. */
export interface DicomInstance {
  file: File;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  modality: string;
  seriesDescription: string;
  seriesNumber?: number;
  instanceNumber?: number;
  imagePositionPatient?: [number, number, number];
  imageOrientationPatient?: [number, number, number, number, number, number];
  numberOfFrames: number;
}

const TAG = {
  StudyInstanceUID: '0020000D',
  SeriesInstanceUID: '0020000E',
  SOPInstanceUID: '00080018',
  Modality: '00080060',
  SeriesDescription: '0008103E',
  SeriesNumber: '00200011',
  InstanceNumber: '00200013',
  ImagePositionPatient: '00200032',
  ImageOrientationPatient: '00200037',
  NumberOfFrames: '00280008',
  PixelData: '7FE00010',
} as const;

/** Sebagian besar header DICOM muat di 128 KB pertama; file utuh hanya dibaca bila perlu. */
const HEADER_PROBE_BYTES = 128 * 1024;

function readDataset(buffer: ArrayBuffer): DicomDataset {
  const dicomDict = dcmjsData.DicomMessage.readFile(buffer, {
    untilTag: TAG.PixelData,
    includeUntilTagValue: false,
  });
  return dicomDict.dict;
}

function first(ds: DicomDataset, tag: string): unknown {
  return ds[tag]?.Value?.[0];
}

function str(ds: DicomDataset, tag: string): string {
  const value = first(ds, tag);
  return value == null ? '' : String(value).trim();
}

function num(ds: DicomDataset, tag: string): number | undefined {
  const value = Number(first(ds, tag));
  return Number.isFinite(value) ? value : undefined;
}

function numArray(ds: DicomDataset, tag: string, length: number): number[] | undefined {
  const values = ds[tag]?.Value?.map(Number);
  if (!values || values.length !== length || values.some((v) => !Number.isFinite(v))) return undefined;
  return values;
}

/**
 * Baca header DICOM dari file lokal dengan dcmjs (berhenti sebelum Pixel Data).
 * Mengembalikan `null` untuk file non-DICOM atau objek tanpa citra (DICOMDIR, SR, dsb).
 */
export async function parseDicomHeader(file: File): Promise<DicomInstance | null> {
  let ds: DicomDataset;
  try {
    ds = readDataset(await file.slice(0, HEADER_PROBE_BYTES).arrayBuffer());
    if (!ds[TAG.PixelData] && file.size > HEADER_PROBE_BYTES) {
      throw new Error('Header lebih besar dari probe');
    }
  } catch {
    try {
      ds = readDataset(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  const seriesInstanceUID = str(ds, TAG.SeriesInstanceUID);
  if (!ds[TAG.PixelData] || !seriesInstanceUID) return null;

  return {
    file,
    studyInstanceUID: str(ds, TAG.StudyInstanceUID),
    seriesInstanceUID,
    sopInstanceUID: str(ds, TAG.SOPInstanceUID),
    modality: str(ds, TAG.Modality),
    seriesDescription: str(ds, TAG.SeriesDescription),
    seriesNumber: num(ds, TAG.SeriesNumber),
    instanceNumber: num(ds, TAG.InstanceNumber),
    imagePositionPatient: numArray(ds, TAG.ImagePositionPatient, 3) as DicomInstance['imagePositionPatient'],
    imageOrientationPatient: numArray(ds, TAG.ImageOrientationPatient, 6) as DicomInstance['imageOrientationPatient'],
    numberOfFrames: Math.max(1, num(ds, TAG.NumberOfFrames) ?? 1),
  };
}
