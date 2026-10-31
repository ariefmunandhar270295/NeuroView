# dicom-loader

Memuat file DICOM lokal ke Cornerstone tanpa upload ke server.

- **Input**: tombol *Buka File* (multi-select, juga di iPad Safari), *Buka Folder* (desktop;
  `webkitdirectory` tidak didukung iOS), dan drag & drop file/folder (rekursif).
- **Parsing**: `parseHeader.ts` membaca header dengan dcmjs dan berhenti sebelum Pixel Data.
  Hanya 128 KB pertama yang dibaca; file utuh dibaca bila header lebih besar.
  File non-DICOM dan objek tanpa citra (DICOMDIR, SR, dsb.) dilewati.
- **Series**: `series.ts` mengelompokkan per `SeriesInstanceUID`, membuang SOP duplikat, dan
  mengurutkan irisan berdasarkan proyeksi `ImagePositionPatient` ke normal bidang
  (fallback `InstanceNumber`). File didaftarkan ke `wadouri.fileManager`, menghasilkan imageId
  `dicomfile:N` (multi-frame: `dicomfile:N?frame=M`).

## API

```ts
const { series, skipped } = await loadDicomFiles(files, (done, total) => {});
const input = createDicomInput({ dropTarget, onFiles });
```
