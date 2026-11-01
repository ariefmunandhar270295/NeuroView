# mpr-viewer

MPR (multiplanar reconstruction) 2×2 dengan `VolumeViewport` Cornerstone3D:

| Kiri atas | Kanan atas | Kiri bawah | Kanan bawah |
| --------- | ---------- | ---------- | ----------- |
| Aksial (merah) | Koronal (hijau) | Sagital (kuning) | Volume rendering 3D (fitur `volume-render`) |

- **Volume**: dibangun dari imageId lokal series (`cornerstoneStreamingImageVolume:<SeriesUID>`),
  di-stream irisan per irisan dengan progres di panel 3D. Hanya satu volume disimpan di cache;
  volume sebelumnya dibuang saat ganti series (hemat memori iPad). Panel 3D memakai volume dan
  tekstur yang sama. Perubahan di MPR (preset, reset, oblik) hanya me-render ulang tiga bidang,
  bukan panel 3D.
- **Crosshair** (`CrosshairsTool`, default di drag kiri / 1 jari): klik untuk memindah pusat,
  seret pusat atau garis untuk menggeser irisan bidang lain. Ketiga bidang selalu sinkron;
  scroll di satu bidang ikut menggeser garis di bidang lain.
- **Oblique MPR** (tombol *Oblik*, `O`): memunculkan handle bulat di ujung garis crosshair; seret
  untuk memutar bidang. Overlay menampilkan sudut oblik (mis. `Aksial · oblik 12°`). Mematikan
  *Oblik* mengembalikan bidang ke ortogonal. Handle slab/MIP disembunyikan (belum dipakai).
- **Window/level tersinkron**: `VOISynchronizer` menyamakan W/L dan invert di ketiga bidang;
  preset (Brain/Subdural/Bone/Stroke, CT saja) diterapkan ke semua bidang.
- **Binding** sama dengan stack viewer: kanan = W/L, tengah / 3 jari = geser, roda = irisan,
  Ctrl+roda / pinch = zoom. Toolbar: Crosshair (`C`), Irisan (`S`), W/L (`W`), Geser (`P`),
  Zoom (`Z`), Oblik (`O`), preset (`1`–`4`), Reset (`R`).
- Series yang tidak memenuhi syarat volume (lihat `dicom-loader`, `reconstructable`) tidak bisa
  dibuka di MPR; toggle layout menampilkan alasannya.

## API

```ts
const mpr = createMprViewer();
container.append(mpr.element); // harus terlihat sebelum showSeries
await mpr.showSeries(series);
mpr.setActive(true); // aktifkan pintasan keyboard
mpr.releaseVolume(); // batalkan pemuatan & buang volume (saat batch file baru dibuka)
```

### Titik ekstensi (dipakai `trajectory-planning`)

```ts
mpr.addPrimaryTool({ name, label, key, ToolClass, configuration }); // sebelum series pertama
mpr.addPanelView({ id, label, element, onShow, onHide });            // tab di panel ke-4
mpr.onReady((ctx) => {
  // ctx.renderingEngineId, ctx.planes (sel + elemen viewport per bidang),
  // ctx.volumeRenderViewportId, ctx.setToolCenter(point)
});
mpr.onVolumeShown(({ series, volumeId }) => {});
mpr.selectTool(name);
```

Biasanya dipakai lewat fitur `viewer-layout` (toggle 1×1 ⇄ 2×2).
