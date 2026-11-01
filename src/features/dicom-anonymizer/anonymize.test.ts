import dcmjs from 'dcmjs';
import { describe, expect, it } from 'vitest';
import { ANONYMOUS_NAME, anonymizeDicom, createPseudonym } from './anonymize';

const { DicomDict, DicomMessage, DicomMetaDictionary } = dcmjs.data as unknown as {
  DicomDict: new (meta: unknown) => { dict: unknown; write(): ArrayBuffer };
  DicomMessage: { readFile(b: ArrayBuffer): { dict: Record<string, { Value?: unknown[] }> } };
  DicomMetaDictionary: { denaturalizeDataset(d: unknown): Record<string, { vr: string }>; uid(): string };
};
(dcmjs as unknown as { log: { setLevel(l: string): void } }).log.setLevel('silent');

const PIXELS = new Int16Array(16 * 16).map((_, i) => i * 7 - 300);

function makeDicom(extra: Record<string, unknown> = {}): ArrayBuffer {
  const sop = '2.25.1234567890';
  const dataset = {
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
    SOPInstanceUID: sop,
    StudyInstanceUID: '2.25.111',
    SeriesInstanceUID: '2.25.222',
    Modality: 'CT',
    SeriesDescription: 'Aksial 5mm',
    StudyDate: '20240312',
    PatientName: 'RAHASIA^PASIEN',
    PatientID: 'MRN-ZX81',
    PatientBirthDate: '19700101',
    PatientBirthTime: '101500',
    InstitutionName: 'RS Contoh Sehat',
    InstitutionAddress: 'Jl. Rahasia No. 1',
    InstitutionalDepartmentName: 'Radiologi Lt 2',
    OtherPatientIDs: 'LAMA-777',
    PatientAddress: 'Jl. Pasien 9',
    Rows: 16,
    Columns: 16,
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    PixelRepresentation: 1,
    PixelData: PIXELS.slice().buffer,
    ...extra,
  };
  const dict = new DicomDict(
    DicomMetaDictionary.denaturalizeDataset({
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: dataset.SOPClassUID,
      MediaStorageSOPInstanceUID: sop,
      TransferSyntaxUID: '1.2.840.10008.1.2.1',
      ImplementationClassUID: '2.25.1',
    }),
  );
  const denaturalized = DicomMetaDictionary.denaturalizeDataset(dataset);
  denaturalized['7FE00010'].vr = 'OW';
  dict.dict = denaturalized;
  return dict.write();
}

const read = (b: ArrayBuffer) => DicomMessage.readFile(b).dict;
const text = (b: ArrayBuffer) => new TextDecoder('latin1').decode(new Uint8Array(b));

describe('anonymizeDicom', () => {
  it('mengganti nama/ID, mengosongkan tanggal lahir, menghapus institusi & identitas lain', () => {
    const out = anonymizeDicom(makeDicom(), 'ANON-TEST01');
    const d = read(out);
    expect((d['00100010'].Value![0] as { Alphabetic: string }).Alphabetic).toBe(ANONYMOUS_NAME);
    expect(d['00100020'].Value![0]).toBe('ANON-TEST01');
    expect(d['00100030']).toBeDefined();
    expect((d['00100030'].Value ?? []).filter((v) => v !== '')).toHaveLength(0);
    for (const tag of ['00100032', '00080080', '00080081', '00081040', '00101000', '00101040']) {
      expect(d[tag], tag).toBeUndefined();
    }
    expect(d['00120063'].Value![0]).toMatch(/NeuroViewer/);
  });

  it('nilai asli tidak tersisa di byte file', () => {
    const raw = text(anonymizeDicom(makeDicom(), 'ANON-TEST01'));
    for (const secret of ['RAHASIA', 'MRN-ZX81', '19700101', 'RS Contoh', 'Jl. Rahasia', 'Radiologi Lt', 'LAMA-777', 'Jl. Pasien']) {
      expect(raw.includes(secret), secret).toBe(false);
    }
  });

  it('piksel dan tag lain tidak berubah', () => {
    const d = read(anonymizeDicom(makeDicom(), 'ANON-TEST01'));
    expect(d['0020000D'].Value![0]).toBe('2.25.111');
    expect(d['00080060'].Value![0]).toBe('CT');
    expect(d['0008103E'].Value![0]).toBe('Aksial 5mm');
    expect(d['00080020'].Value![0]).toBe('20240312');
    expect(Array.from(new Int16Array(d['7FE00010'].Value![0] as ArrayBuffer))).toEqual(Array.from(PIXELS));
  });

  it('tetap bekerja bila tag opsional tidak ada', () => {
    const minimal = makeDicom({ PatientBirthDate: undefined, InstitutionName: undefined, OtherPatientIDs: undefined });
    expect(() => anonymizeDicom(minimal, 'ANON-TEST02')).not.toThrow();
  });

  it('nama/ID yang terulang di tag teks lain ikut diganti (mis. StudyID = PatientID)', () => {
    const repeated = makeDicom({ PatientComments: 'Kontrol RAHASIA^PASIEN bulan depan', StudyID: 'MRN-ZX81' });
    const out = anonymizeDicom(repeated, 'ANON-TEST03');
    const d = read(out);
    expect(d['00104000'].Value![0]).toBe('Kontrol ANONIM bulan depan');
    expect(d['00200010'].Value![0]).toBe('ANON-TEST03');
    expect(text(out).includes('RAHASIA') || text(out).includes('MRN-ZX81')).toBe(false);
  });

  it('ID numerik hanya diganti bila sama persis', () => {
    const d = read(anonymizeDicom(makeDicom({ PatientID: '4471', StudyID: '4471', AccessionNumber: 'A44710' }), 'ANON-TEST05'));
    expect(d['00200010'].Value![0]).toBe('ANON-TEST05');
    expect(d['00080050'].Value![0]).toBe('A44710');
  });

  it('gagal (tidak menghasilkan file) bila nama pasien tersisa di data biner', () => {
    const name = new TextEncoder().encode('xxRAHASIA^PASIENxx');
    const leaky = makeDicom({ '00291010': undefined });
    // Tag privat biner (OB) berisi nama: tidak bisa dibersihkan, jadi harus ditolak.
    const dict = DicomMessage.readFile(leaky) as unknown as { dict: Record<string, unknown>; write(): ArrayBuffer };
    dict.dict['00290010'] = { vr: 'LO', Value: ['VENDOR'] };
    dict.dict['00291010'] = { vr: 'OB', Value: [name.buffer] };
    expect(() => anonymizeDicom(dict.write(), 'ANON-TEST06')).toThrow(/data biner/);
  });

  it('ID berupa angka yang kebetulan ada di UID tidak dianggap bocor', () => {
    const numeric = makeDicom({ PatientID: '1234567890' }); // muncul di SOPInstanceUID
    expect(() => anonymizeDicom(numeric, 'ANON-TEST04')).not.toThrow();
  });
});

describe('createPseudonym', () => {
  it('format ANON-XXXXXX dan acak', () => {
    const a = createPseudonym();
    expect(a).toMatch(/^ANON-[A-HJ-NP-Z2-9]{6}$/);
    expect(createPseudonym()).not.toBe(a);
  });
});
