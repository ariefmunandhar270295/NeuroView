# viewer-layout

Toggle layout di awal toolbar: **1×1** (stack viewer, bidang akuisisi asli) dan **2×2 MPR**
(aksial/koronal/sagital + panel 3D). Pintasan: `M`.

- Toolbar di header mengikuti viewer yang aktif.
- Series terakhir tiap viewer diingat agar tidak dimuat ulang; `reset()` melupakannya saat batch
  file baru dibuka (UID series bisa sama bila folder yang sama dibuka lagi).
- Series hanya dimuat ke viewer yang terlihat; viewer lain menyusul saat layout diganti
  (stack tidak memuat ulang bila series sama).
- Tombol 2×2 nonaktif untuk series yang tidak bisa dijadikan volume (mis. localizer 2 irisan,
  jarak irisan tidak seragam) dengan alasan di tooltip. Memilih series seperti itu saat berada di
  2×2 otomatis kembali ke 1×1 dan menampilkan alasannya di status bar.
- Viewer yang tersembunyi tidak menanggapi pintasan keyboard.

## API

```ts
const layout = createViewerLayout({ stack, mpr, onMessage: (text) => (status.textContent = text) });
header.append(layout.toolbar);
main.append(layout.element);
await layout.showSeries(series);
await layout.setMode('2x2');
layout.reset();
```
