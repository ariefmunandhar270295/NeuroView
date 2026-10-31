# export

Menu **Ekspor** di header.

- **Screenshot PNG**: tampilan viewport yang sedang terlihat. Di layout 1×1 ini viewport stack;
  di 2×2 seluruh grid (aksial, koronal, sagital, dan 3D atau probe's eye).
  - Isi PNG: canvas Cornerstone, layer SVG (pengukuran, overlay rencana trajektori), dan teks
    overlay (series, irisan, W/L), ditambah pita bawah berisi disclaimer dan waktu ekspor.
  - Tidak ikut: tombol, slider, dan kontrol lain.
  - Resolusi mengikuti `devicePixelRatio` (tajam di layar Retina/iPad).
- **Anotasi & trajektori (JSON)** (`neuroviewer-annotations`, versi 1):
  - Pengukuran Jarak (`length` + `unit`), Sudut (`angleDeg`), dan Probe (`value`, `unit`,
    `modality`), masing-masing dengan titik dalam koordinat pasien LPS (mm) serta referensi
    citra (`seriesInstanceUID`, `sopInstanceUID`, `frame`).
  - Rencana trajektori lengkap ikut disertakan bila ada (format sama dengan ekspor di panel
    Rencana).
  - Tidak ada nama atau ID pasien. Disclaimer ikut di setiap file.

Fitur lain bisa menambah item menu lewat `exportMenu.addItem(label, title, onClick)`.

## API

```ts
const exportMenu = createExportMenu({
  getCaptureElement: () => visibleViewportElement,
  describeImage: createImageIndex(studies), // imageId → UID series/instance
  getTrajectoryPlan: () => planner.store.toJSON(),
  onMessage: (text) => (status.textContent = text),
});
header.append(exportMenu.element);
```
