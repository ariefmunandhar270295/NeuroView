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

## API

```ts
const { studies, skipped } = await loadDicomFiles(files, (done, total) => {});
// studies[i].series[j].imageIds siap dipakai viewport
const input = createDicomInput({ dropTarget, onFiles });
```
