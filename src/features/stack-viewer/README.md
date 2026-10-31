# stack-viewer

Viewer 2D satu series (Cornerstone3D `StackViewport`) dengan toolbar, overlay, dan slider irisan.

## Interaksi

| Aksi               | Mouse / keyboard           | iPad (touch)          |
| ------------------ | -------------------------- | --------------------- |
| Tool aktif toolbar | Klik kiri + seret          | 1 jari                |
| Zoom               | Klik kanan + seret         | Pinch 2 jari          |
| Geser (pan)        | Klik tengah + seret        | Pilih *Geser* di toolbar |
| Ganti irisan       | Roda mouse, ↑/↓, PgUp/PgDn | Geser 3 jari / slider |
| Reset / Invert     | `R` / `I`                  | Tombol toolbar        |

Tool di toolbar: W/L (`W`), Geser (`P`), Zoom (`Z`), Irisan (`S`), Jarak (`L`), Sudut (`A`),
Probe (`H`). Tool ukur yang tidak aktif tetap *passive* sehingga anotasinya bisa diedit.

Overlay sengaja tidak menampilkan identitas pasien.

## API

```ts
const viewer = createStackViewer();
header.append(viewer.toolbar);
main.append(viewer.element);
await viewer.showSeries(series);
```

Rencana lanjutan: MPR (VolumeViewport), volume rendering 3D (vtk.js), preset W/L (otak,
tulang, subdural), dan marker orientasi.
