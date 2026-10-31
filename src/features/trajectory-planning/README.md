# trajectory-planning

Perencanaan trajektori ala Brainlab di atas MPR 2×2. **Hanya untuk edukasi**: perhitungan belum
tervalidasi untuk perencanaan, navigasi, atau keputusan klinis. Peringatan ini juga tampil di
panel dan ikut di setiap ekspor JSON.

## Alur

1. Buka series yang layak volume di layout **2×2 MPR**, lalu tab sidebar **Rencana**.
2. **Landmark**: *Tandai* AC dan PC (wajib untuk sudut), serta *Midline* (opsional) dengan klik/tap
   di salah satu bidang MPR. Titik diletakkan di irisan yang sedang tampil.
3. **Trajektori**: *+ Baru*, lalu *Tandai Target* dan *Tandai Entry*. Bisa beberapa trajektori;
   masing-masing punya nama (bisa diganti) dan warna sendiri.
4. Tool **Titik** (`T`) aktif otomatis: seret titik mana pun untuk menggesernya. Jarak titik ke
   bidang irisan dipertahankan, jadi menyeret di aksial hanya mengubah posisi aksialnya.
5. *Ke entry* / *Ke target* / *Ke* memindahkan pusat crosshair ke titik itu. `Esc` membatalkan
   mode tandai.
6. **Ekspor JSON** mengunduh semua landmark dan trajektori.

## Tampilan

- **Bidang MPR** (overlay SVG): proyeksi trajektori, perpanjangan putus-putus 40 mm ke luar entry,
  entry (E) dan target (T), titik tembus trajektori pada irisan aktif, landmark AC/PC/midline.
  Titik yang berada ≤ 1,5 mm dari irisan digambar penuh; yang lebih jauh digambar redup.
- **3D**: tabung entry→target, perpanjangan ke luar entry, dan bola untuk titik/landmark sebagai
  aktor vtk.js di dalam volume rendering. Dengan preset Tulang bagian dalam tertutup tengkorak;
  perpanjangan luar tetap menunjukkan arah datang.
- **Probe's eye** (tab di panel ke-4): reslice tegak lurus trajektori aktif dilihat dari arah
  entry, dengan cincin 2 dan 5 mm. Kedalaman dari entry diatur lewat slider atau roda mouse
  (1 mm, Shift 0,5 mm), hingga 10 mm melewati target. Atas layar = anterior pasien (superior bila
  trajektori hampir sejajar sumbu AP). Posisi probe ditandai di ketiga bidang MPR.

## Geometri (`geometry.ts`, diuji di `geometry.test.ts`)

Semua koordinat dalam sistem pasien DICOM **LPS** (mm): +x kiri, +y posterior, +z superior.

- **Sistem AC-PC**, berpusat di **MCP** (titik tengah AC-PC):
  - *anterior* = arah PC → AC
  - *kanan* = normal bidang mid-sagital. Dengan titik midline, bidang itu melalui AC, PC, dan
    midline. Tanpa midline, dipakai arah kanan scanner yang diortogonalkan terhadap garis AC-PC,
    artinya kepala dianggap tidak miring ke samping. Gunakan midline bila kepala miring (roll).
  - *superior* = kanan × anterior
  - Bidang AC-PC memuat garis AC-PC dan sumbu kanan.
- **Panjang** = |entry − target|.
- **Sudut terhadap bidang AC-PC**: sudut antara garis trajektori dan bidang AC-PC
  (0° sejajar, 90° tegak lurus).
- **Sudut sagital**: arah target→entry diproyeksikan ke bidang mid-sagital, diukur dari garis AC-PC
  ke arah anterior (90° = vertikal, < 90° = entry lebih anterior dari target).
- **Sudut koronal**: arah target→entry diproyeksikan ke bidang koronal, diukur dari vertikal,
  plus sisi entry (kanan/kiri) relatif target.
- **Target relatif MCP**: lateral (+kanan), AP (+anterior), vertikal (+superior), dalam mm.

## Format JSON (`neuroviewer-trajectory-plan`, versi 1)

Setiap titik berisi `lps`, `ras`, dan (bila AC & PC ada) `acpc` `{ lateral, ap, vertical }`.
Trajektori berisi `lengthMm`, `directionLps` (vektor satuan entry→target), dan `angles`
(`elevationToAcPcPlaneDeg`, `sagittalFromAcPcLineDeg`, `coronalFromVerticalDeg`,
`coronalEntrySide`). File juga memuat `frameOfReferenceUID`, `studyInstanceUID`,
`seriesInstanceUID`, dan deskripsi series untuk mengaitkan koordinat dengan citranya. Nama atau
ID pasien tidak disertakan.

## Rencana per FrameOfReference

Koordinat hanya bermakna dalam satu kerangka koordinat pasien. Rencana disimpan per
`FrameOfReferenceUID` (per series bila tag itu tidak ada). Berpindah ke series dengan kerangka
lain menampilkan rencana lain, dan kembali ke series semula memulihkannya. Rencana hanya
tersimpan selama halaman terbuka; simpan lewat ekspor JSON.

## Struktur

| File            | Isi                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| `geometry.ts`   | Vektor, sistem AC-PC, metrik & sudut, LPS→RAS, irisan bidang              |
| `store.ts`      | State per FrameOfReference, mode tandai, ekspor JSON                      |
| `planTool.ts`   | Tool Cornerstone untuk menyeret titik (mouse & touch)                     |
| `overlay2d.ts`  | Overlay SVG di tiga bidang MPR                                            |
| `scene3d.ts`    | Aktor vtk.js (tabung & bola) di viewport 3D                               |
| `probeView.ts`  | Viewport probe's eye + slider kedalaman                                   |
| `panel.ts`      | Panel sidebar "Rencana"                                                   |
| `index.ts`      | Perakitan; titik baru ditandai langsung di `pointerdown` (lihat catatan)  |

Catatan: Cornerstone menahan setiap klik 400 ms untuk deteksi double-click memakai state global,
dan membuang klik itu bila ada mouseup lain dalam jendela tersebut (misalnya langsung menekan
*Tandai Entry* setelah menandai target). Karena itu penandaan titik baru tidak lewat tool
Cornerstone, melainkan langsung di `pointerdown` viewport.

## API

```ts
const planner = createTrajectoryPlanner({ mpr, ensureMpr: () => layout.setMode('2x2') });
sidebarPane.append(planner.panel);
```
