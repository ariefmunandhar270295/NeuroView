# series-browser

Sidebar kiri berisi Study → Series:

- **Study**: grup yang bisa dilipat (`<details>`), berisi deskripsi study, tanggal, modalitas,
  dan jumlah series. Nama/ID pasien tidak pernah ditampilkan.
- **Series**: thumbnail irisan tengah, badge modalitas, deskripsi, nomor series, bidang
  (Aksial/Sagital/…), dan jumlah gambar. Item berupa `<button>` (klik, tap, atau keyboard).
- **Thumbnail** (`thumbnails.ts`): dirender satu per satu saat item masuk layar
  (`IntersectionObserver`) dengan CPU rendering, supaya decode tidak menumpuk dan tidak memakai
  konteks WebGL tambahan (iPad membatasi jumlahnya). W/L mengikuti nilai default di file DICOM.
  Metadata dibaca lewat `ensureInstanceMetadata` (fitur `dicom-loader`) agar tidak bentrok dengan
  prefetch MPR yang membaca file yang sama.

## API

```ts
const browser = createSeriesBrowser((series) => viewer.showSeries(series));
sidebar.append(browser.element);
browser.setStudies(studies);
browser.setActive(series.seriesInstanceUID);
```
