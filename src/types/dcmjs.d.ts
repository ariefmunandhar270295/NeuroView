// dcmjs tidak menyertakan type definition; deklarasi minimal untuk bagian yang dipakai.
declare module 'dcmjs' {
  export interface ReadFileOptions {
    ignoreErrors?: boolean;
    untilTag?: string | null;
    includeUntilTagValue?: boolean;
    noCopy?: boolean;
    forceStoreRaw?: boolean;
  }

  export interface DicomDataElement {
    vr: string;
    Value?: unknown[];
  }

  export type DicomDataset = Record<string, DicomDataElement>;

  export class DicomDict {
    constructor(meta: DicomDataset);
    meta: DicomDataset;
    dict: DicomDataset;
    /** Serialisasi kembali ke file DICOM Part 10. */
    write(options?: { allowInvalidVRLength?: boolean }): ArrayBuffer;
  }

  export class DicomMessage {
    static readFile(buffer: ArrayBuffer, options?: ReadFileOptions): DicomDict;
  }

  export class DicomMetaDictionary {
    static naturalizeDataset(dataset: DicomDataset): Record<string, unknown>;
  }

  export const data: {
    DicomMessage: typeof DicomMessage;
    DicomMetaDictionary: typeof DicomMetaDictionary;
    DicomDict: typeof DicomDict;
  };

  export const log: {
    getLogger(name: string): { setLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'): void };
  };

  const dcmjs: {
    data: typeof data;
    log: typeof log;
  };
  export default dcmjs;
}
