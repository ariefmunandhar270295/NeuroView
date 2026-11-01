# stack-viewer

Viewer 2D satu series (Cornerstone3D `StackViewport`) dengan toolbar, overlay, dan slider irisan.

## Interaksi

| Aksi                 | Mouse / keyboard                        | iPad (touch)                 |
| -------------------- | --------------------------------------- | ---------------------------- |
| Ganti irisan         | Roda mouse, drag kiri, ↑/↓, PgUp/PgDn   | Swipe 1 jari, slider         |
| Window/level         | Drag kanan                              | Pilih *W/L*, lalu 1 jari     |
| Zoom                 | Ctrl + roda (pinch trackpad Mac)        | Pinch 2 jari                 |
| Geser (pan)          | Drag tengah                             | Geser 3 jari                 |
| Preset window (CT)   | Tombol atau `1` Brain, `2` Subdural, `3` Bone, `4` Stroke | Tombol toolbar |
| Reset / Invert       | `R` / `I`                               | Tombol toolbar               |

Toolbar mengganti tool untuk drag kiri / 1 jari: Irisan (`S`, default), W/L (`W`), Geser (`P`),
Zoom (`Z`), Jarak (`L`), Sudut (`A`), Probe (`H`). Tool ukur yang tidak aktif tetap *passive*
sehingga anotasinya bisa diedit. Preset dari fitur `window-presets` hanya aktif untuk CT.

Series ditampilkan pada bidang akuisisinya (CT kepala umumnya aksial); bidangnya tertulis di
overlay. Reformat ke bidang lain menyusul bersama fitur MPR.

Overlay: modalitas + nama series, bidang, irisan ke-N, nama preset (bila cocok), dan WW/WL.
Nama/ID pasien sengaja tidak ditampilkan.

## API

```ts
const viewer = createStackViewer();
header.append(viewer.toolbar);
main.append(viewer.element);
await viewer.showSeries(series);
```

Rencana lanjutan: MPR (VolumeViewport), volume rendering 3D (vtk.js), marker orientasi.
