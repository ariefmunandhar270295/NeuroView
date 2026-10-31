import { data as dcmjsData, type DicomDataset } from 'dcmjs';

/** Nilai pengganti PatientName. */
export const ANONYMOUS_NAME = 'ANONIM';

/** Diganti nilai baru (tag dipertahankan karena wajib ada di banyak IOD). */
const REPLACED = {
  PatientName: '00100010',
  PatientID: '00100020',
} as const;

/** Dikosongkan (Type 2: tag tetap ada tetapi tanpa nilai). */
const EMPTIED: Record<string, string> = {
  '00100030': 'PatientBirthDate',
};

/** Dihapus seluruhnya. */
const REMOVED: Record<string, string> = {
  '00100032': 'PatientBirthTime',
  '00080080': 'InstitutionName',
  '00080081': 'InstitutionAddress',
  '00081040': 'InstitutionalDepartmentName',
  '00101000': 'OtherPatientIDs',
  '00101001': 'OtherPatientNames',
  '00101002': 'OtherPatientIDsSequence',
  '00101040': 'PatientAddress',
  '00102154': 'PatientTelephoneNumbers',
};

const DEIDENTIFICATION_METHOD = '00120063';
/** VR LO: maks. 64 karakter. */
const METHOD_TEXT = 'NeuroViewer: anonimisasi dasar (bukan profil PS3.15)';

/** VR teks yang diperiksa untuk nama/ID pasien yang terulang (UI, DS, IS, dan biner dilewati). */
const TEXT_VRS = new Set(['AE', 'AS', 'CS', 'DA', 'DT', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UT']);

/** Ringkasan untuk UI & README. */
export const ANONYMIZED_FIELDS = {
  replaced: [
    'PatientName → ANONIM',
    'PatientID → pseudonim acak (sama untuk satu unduhan)',
    'Nama/ID pasien yang terulang di tag teks lain (mis. StudyID, komentar, sequence) → ikut diganti',
  ],
  emptied: Object.values(EMPTIED),
  removed: Object.values(REMOVED),
};

/** Pseudonim acak `ANON-XXXXXX` (tanpa karakter yang mudah tertukar). */
export function createPseudonym(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `ANON-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

type Element = DicomDataset[string];

/**
 * Ganti nama/ID pasien asli yang terulang di elemen teks lain, termasuk di dalam sequence
 * (mis. StudyID yang sama dengan PatientID). ID tanpa huruf hanya diganti bila nilainya sama
 * persis, agar angka yang kebetulan mirip tidak ikut berubah. Mengembalikan jumlah elemen yang diubah.
 */
function scrubRepeats(dataset: DicomDataset, name: string, id: string, pseudonym: string, topLevel = true): number {
  const replaceText = (text: string) => {
    let out = text;
    if (name.length >= 3) out = out.split(name).join(ANONYMOUS_NAME);
    if (id && out === id) out = pseudonym;
    else if (id.length >= 3 && /[a-z]/i.test(id)) out = out.split(id).join(pseudonym);
    return out;
  };
  let changed = 0;
  for (const [tag, element] of Object.entries(dataset)) {
    if (topLevel && (tag === REPLACED.PatientName || tag === REPLACED.PatientID)) continue;
    if (element.vr === 'SQ') {
      for (const item of (element.Value ?? []) as DicomDataset[]) changed += scrubRepeats(item, name, id, pseudonym, false);
      continue;
    }
    if (!TEXT_VRS.has(element.vr) || !element.Value?.length) continue;
    const next = element.Value.map((value) => {
      if (typeof value === 'string') return replaceText(value);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'string' ? replaceText(v) : v]));
      }
      return value;
    });
    if (JSON.stringify(next) !== JSON.stringify(element.Value)) {
      // Elemen baru tanpa `_rawValue` agar nilai asli tidak tertulis kembali.
      dataset[tag] = { vr: element.vr, Value: next } as Element;
      changed += 1;
    }
  }
  return changed;
}

function anonymizeDataset(dict: DicomDataset, pseudonym: string) {
  scrubRepeats(
    dict,
    personName(dict[REPLACED.PatientName]?.Value?.[0]),
    String(dict[REPLACED.PatientID]?.Value?.[0] ?? ''),
    pseudonym,
  );
  // Ganti elemen utuh: dcmjs menyimpan nilai asli di `_rawValue` dan bisa menuliskannya kembali.
  dict[REPLACED.PatientName] = { vr: 'PN', Value: [{ Alphabetic: ANONYMOUS_NAME }] };
  dict[REPLACED.PatientID] = { vr: 'LO', Value: [pseudonym] };
  for (const tag of Object.keys(EMPTIED)) dict[tag] = { vr: dict[tag]?.vr ?? 'DA', Value: [] };
  for (const tag of Object.keys(REMOVED)) delete dict[tag];
  dict[DEIDENTIFICATION_METHOD] = { vr: 'LO', Value: [METHOD_TEXT] };
}

function readHeader(buffer: ArrayBuffer): DicomDataset {
  return dcmjsData.DicomMessage.readFile(buffer, { untilTag: '7FE00010', includeUntilTagValue: false }).dict;
}

function personName(value: unknown): string {
  if (typeof value === 'string') return value;
  return String((value as { Alphabetic?: string } | undefined)?.Alphabetic ?? '');
}

/** Cari potongan byte (ASCII) di buffer, untuk memastikan nilai asli tidak tertulis lagi. */
function containsAscii(buffer: ArrayBuffer, text: string): boolean {
  if (!text) return false;
  const haystack = new Uint8Array(buffer);
  const needle = new TextEncoder().encode(text);
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Anonimkan satu file DICOM Part 10 di browser. Mengembalikan file baru; piksel dan tag lain
 * tidak diubah. Hasilnya dibaca ulang dan diverifikasi; bila ada yang lolos, fungsi melempar
 * error sehingga tidak ada file setengah-teranonimkan yang keluar.
 */
export function anonymizeDicom(buffer: ArrayBuffer, pseudonym: string): ArrayBuffer {
  const dicomDict = dcmjsData.DicomMessage.readFile(buffer);
  const original = dicomDict.dict;
  // Nama & ID asli tidak boleh tersisa di mana pun dalam file (mis. tag privat atau sequence).
  // Nilai tanpa huruf dilewati: angka pendek bisa kebetulan muncul di dalam UID.
  const secrets = [
    personName(original[REPLACED.PatientName]?.Value?.[0]),
    String(original[REPLACED.PatientID]?.Value?.[0] ?? ''),
  ].filter((s) => s.trim().length >= 3 && /[a-z]/i.test(s) && s !== ANONYMOUS_NAME);

  anonymizeDataset(original, pseudonym);
  const output = dicomDict.write();

  const check = readHeader(output);
  const problems: string[] = [];
  if (personName(check[REPLACED.PatientName]?.Value?.[0]) !== ANONYMOUS_NAME) problems.push('PatientName');
  if (check[REPLACED.PatientID]?.Value?.[0] !== pseudonym) problems.push('PatientID');
  // dcmjs membaca elemen kosong sebagai [""].
  const hasValue = (tag: string) => (check[tag]?.Value ?? []).some((v) => v !== '' && v != null);
  for (const [tag, name] of Object.entries(EMPTIED)) if (hasValue(tag)) problems.push(name);
  for (const [tag, name] of Object.entries(REMOVED)) if (check[tag]) problems.push(name);
  if (secrets.some((secret) => containsAscii(output, secret))) {
    problems.push('nama/ID pasien asli masih ditemukan di data biner (mis. tag privat) yang tidak bisa dibersihkan');
  }
  if (problems.length) throw new Error(`Verifikasi anonimisasi gagal: ${problems.join(', ')}`);
  return output;
}
