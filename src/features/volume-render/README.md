# volume-render

Volume rendering 3D di panel keempat layout MPR, memakai `VolumeViewport3D` Cornerstone3D
(ray casting vtk.js: `vtkVolume` + shared volume mapper + transfer function).

- **Volume yang sama dengan MPR**: viewport 3D berada di rendering engine yang sama, sehingga
  tekstur volume dipakai bersama; tidak ada salinan memori tambahan.
- **Preset** (dropdown di panel):

  | CT                 | MR       |
  | ------------------ | -------- |
  | Tulang (default)   | Default  |
  | Jaringan lunak     | T2 otak  |
  | Otot & kulit       | MIP      |
  | MIP                |          |

  Preset composite memakai transfer function bawaan Cornerstone (`CT-Bone`, `CT-Soft-Tissue`,
  `CT-Muscle`, `MR-Default`, `MR-T2-Brain`). **MIP** dibuat sendiri dengan vtk.js: blend mode
  `MAXIMUM_INTENSITY` di mapper aktor ini dan ramp abu-abu linear (CT 0–2000 HU, MR rentang
  voxel). Preset CT-MIP bawaan tidak dipakai karena sudah putih penuh sejak −637 HU, sehingga
  dengan blend MIP hasilnya hanya siluet. `VolumeViewport3D.setBlendMode` di Cornerstone tidak
  melakukan apa-apa, karena itu blend mode diatur langsung di mapper vtk.js (mapper per viewport,
  jadi MPR tidak terpengaruh).
- **Interaksi**: kiri / 1 jari = putar (TrackballRotate, kualitas diturunkan sementara saat
  memutar), roda / kanan / pinch = zoom, tengah / 3 jari = geser. Tidak memengaruhi MPR.
- **Reset 3D** mengembalikan arah pandang awal (tampak depan/koronal) dan zoom.
- Preset W/L MPR tidak mengubah 3D; transfer function 3D diatur lewat preset sendiri.

## API

```ts
const panel = createVolumeRenderPanel('mpr-3d');
cell.append(panel.element);
renderingEngine.setViewports([...mprInputs, panel.viewportInput]);
panel.attach(renderingEngineId);
await setVolumesForViewports(renderingEngine, [{ volumeId }], [...mprIds, panel.viewportId]);
panel.show(series.modality);
panel.setStatus('Memuat volume 40%');
```
