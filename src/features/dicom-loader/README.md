# dicom-loader

Memuat file DICOM lokal ke Cornerstone tanpa upload ke server.

- **Input**: tombol *Buka Folder DICOM* (`webkitdirectory`, desktop), *Buka File* (multi-select;
  satu-satunya opsi di iPad karena Safari iOS tidak mendukung `webkitdirectory`), dan drag & drop
  file/folder (rekursif).
- **Parsing**: `parseHeader.ts` membaca header dengan dcmjs dan berhenti sebelum Pixel Data.
  Hanya 128 KB pertama yang dibaca; file utuh dibaca bila header lebih besar.
  File non-DICOM dan objek tanpa citra (DICOMDIR, SR, dsb.) dilewati.
- **Study → Series**: `series.ts` mengelompokkan per `SeriesInstanceUID`, membuang SOP duplikat,
  mengurutkan irisan berdasarkan proyeksi `ImagePositionPatient` ke normal bidang
  (fallback `InstanceNumber`), lalu mengelompokkan series per `StudyInstanceUID`
  (deskripsi + tanggal study, tanpa data pasien). Bidang akuisisi (Aksial/Sagital/Koronal/Oblik)
  dideteksi dari `ImageOrientationPatient`. File didaftarkan ke `wadouri.fileManager`,
  menghasilkan imageId `dicomfile:N` (multi-frame: `dicomfile:N?frame=M`).
- **Kelayakan volume**: `reconstructable` bernilai true bila series bisa dipakai MPR — minimal
  3 irisan single-frame, orientasi dan ukuran matriks sama, posisi irisan unik, dan jarak
  antar-irisan seragam (toleransi 10%). Bila tidak, `volumeIssue` berisi alasannya.

- **Prefetch metadata** (`prefetch.ts`): untuk file lokal, metadata Cornerstone baru ada setelah
  file dibaca loader. `prefetchSeriesMetadata` membaca semua irisan lebih dulu (jalur yang sama
  dengan loader, 4 paralel) sehingga volume MPR bisa dibuat.

## API

```ts
const { studies, skipped } = await loadDicomFiles(files, (done, total) => {});
// studies[i].series[j].imageIds siap dipakai viewport
const input = createDicomInput({ dropTarget, onFiles });
await prefetchSeriesMetadata(series, (done, total) => {}); // sebelum membuat volume
```
