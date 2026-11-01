# NeuroViewer

Viewer DICOM berbasis web untuk **edukasi** dan latihan perencanaan bedah saraf, terinspirasi
Horos/Brainlab. Berjalan sepenuhnya di browser (desktop Chrome dan iPad Safari), bisa dipasang
sebagai aplikasi, dan bisa dipakai tanpa internet setelah dibuka sekali.

> [!WARNING]
> **Bukan untuk diagnosis klinis.** NeuroViewer adalah alat edukasi. Fitur ini tidak tervalidasi
> dan bukan perangkat medis:
> - tampilan citra, pengukuran, MPR, dan volume rendering;
> - perhitungan trajektori dan anonimisasi.
>
> Jangan gunakan NeuroViewer untuk diagnosis, perencanaan operasi, navigasi, atau keputusan
> klinis apa pun.

**Demo:** <https://ariefmunandhar270295.github.io/NeuroView/> (aktif setelah GitHub Pages
dinyalakan, lihat [Deploy](#deploy-ke-github-pages)).

## Privasi

Semua file DICOM dibaca dan diproses **di browser Anda**. Tidak ada yang diunggah ke server, dan
aplikasi tidak melakukan request jaringan ke pihak lain. Nama dan ID pasien tidak ditampilkan di
layar maupun di ekspor PNG/JSON.

Untuk mode offline, service worker hanya menyimpan file aplikasi (HTML, JS, codec) di perangkat.
Data DICOM tidak pernah disimpan di cache tersebut.

## Fitur

| Fitur | Ringkas |
| --- | --- |
| Membuka data | Folder DICOM, banyak file, atau drag & drop; dikelompokkan Study → Series dengan thumbnail |
| Viewer 2D (1×1) | Scroll irisan, window/level, zoom, pan, ukur jarak/sudut/probe (HU), invert |
| Preset window CT | Brain 80/40, Subdural 200/75, Bone 2800/600, Stroke 40/40 |
| MPR (2×2) | Aksial, koronal, sagital dengan crosshair sinkron, MPR oblik, W/L tersinkron |
| 3D | Volume rendering (vtk.js) dengan preset Tulang, Jaringan lunak, Otot & kulit, MIP |
| Perencanaan trajektori | Entry/target, AC-PC, panjang & sudut, probe's eye view, banyak trajektori |
| Ekspor | Screenshot PNG, anotasi & trajektori JSON |
| Anonimisasi | Hapus identitas pasien & institusi lalu unduh ulang DICOM (ZIP) |
| Offline & pasang (PWA) | Pasang di iPad (Layar Utama) atau desktop; berjalan tanpa internet |

Format yang sudah diuji: CT/MR/NM/SC dengan transfer syntax uncompressed (little/big endian,
implicit VR), JPEG baseline dan lossy 12-bit, JPEG-LS, JPEG 2000, dan RLE, termasuk multi-frame.
Codec lain yang didukung Cornerstone (mis. HTJ2K) belum diuji.

## Cara pakai

### 1. Membuka data

- **Desktop:** tombol **Buka Folder DICOM**, **Buka File**, atau seret folder/file ke jendela.
- **iPad:** **Buka File** lalu pilih banyak file sekaligus dari aplikasi Files. Safari iOS tidak
  mendukung pemilihan folder.

Series dikelompokkan per study di sidebar kiri (tab **Series**). Ketuk satu series untuk
menampilkannya. Secara default dibuka series aksial dengan irisan terbanyak.

Membuka file/folder baru menggantikan data sebelumnya: gambar, volume, dan pengukurannya dilepas
dari memori. Rencana trajektori tetap tersimpan selama tab terbuka dan muncul lagi bila data
dengan frame of reference yang sama dibuka.

### 2. Navigasi gambar

| Aksi | Mouse / keyboard | iPad |
| --- | --- | --- |
| Ganti irisan | Roda mouse, drag kiri, ↑/↓, PgUp/PgDn | Swipe 1 jari, slider |
| Window/level | Drag kanan | Pilih **W/L**, lalu geser 1 jari |
| Zoom | Ctrl + roda (pinch trackpad) | Pinch 2 jari |
| Geser (pan) | Drag tengah | Geser 3 jari |
| Preset window (CT) | `1` Brain, `2` Subdural, `3` Bone, `4` Stroke | Tombol toolbar |
| Reset / invert | `R` / `I` | Tombol toolbar |
| Layout 1×1 ⇄ 2×2 | `M` | Tombol **1×1 / 2×2 MPR** |

Tool drag kiri / 1 jari di layout 1×1: Irisan (`S`), W/L (`W`), Geser (`P`), Zoom (`Z`),
Jarak (`L`), Sudut (`A`), Probe (`H`).

### 3. MPR & 3D (layout 2×2)

- Panel aksial (merah), koronal (hijau), sagital (kuning), dan 3D.
- **Crosshair** (`C`): klik untuk memindah pusat, atau seret garis/pusat. Ketiga bidang selalu
  sinkron.
- **Oblik** (`O`): seret handle bulat di garis crosshair untuk memutar bidang; sudutnya tampil di
  overlay. Matikan untuk kembali ortogonal.
- W/L di satu bidang berlaku untuk ketiganya. Preset window diterapkan ke semua bidang.
- **3D**: kiri/1 jari memutar, roda/pinch zoom. Preset dipilih lewat dropdown di panel 3D;
  **Reset 3D** mengembalikan tampak depan.
- MPR hanya untuk series yang bisa dijadikan volume: minimal 3 irisan dengan jarak seragam.
  Bila tidak memenuhi syarat, alasannya ditampilkan.

### 4. Perencanaan trajektori

1. Buka layout 2×2, lalu tab sidebar **Rencana**.
2. **Tandai** AC dan PC (serta Midline, opsional) dengan klik/tap di bidang MPR.
3. **+ Baru**, lalu **Tandai Target** dan **Tandai Entry**. Titik bisa diseret untuk dikoreksi
   (tool **Titik**, `T`).
4. Panel menampilkan:
   - panjang trajektori;
   - sudut terhadap bidang AC-PC;
   - sudut sagital dan koronal;
   - posisi target relatif MCP.
5. Tab **Probe's eye** di panel ke-4 menampilkan irisan tegak lurus trajektori. Kedalaman diatur
   dengan slider atau roda mouse.
6. **Ekspor JSON** menyimpan koordinat (LPS, RAS, dan relatif AC-PC) beserta sudutnya.

Definisi sudut dan sistem koordinat: [`src/features/trajectory-planning/README.md`](src/features/trajectory-planning/README.md).

### 5. Ekspor

Menu **Ekspor** di kanan atas:

- **Screenshot PNG**: tampilan viewport saat ini, termasuk overlay, pengukuran, dan trajektori,
  dengan pita disclaimer di bawahnya. Resolusi mengikuti layar (Retina).
- **Anotasi & trajektori (JSON)**: pengukuran jarak/sudut/probe (koordinat LPS, nilai, UID citra)
  dan rencana trajektori.
- **Anonimkan & unduh DICOM…**: lihat bagian berikut.

### 6. Anonimisasi DICOM

Menganonimkan series yang sedang tampil atau seluruh study, lalu mengunduhnya sebagai ZIP.

- **Diganti/dihapus:**
  - PatientName menjadi `ANONIM`.
  - PatientID menjadi pseudonim acak.
  - PatientBirthDate dikosongkan.
  - Jam lahir, data institusi (nama, alamat, departemen), ID/nama pasien lain, serta alamat dan
    telepon pasien dihapus.
  - Nama/ID pasien yang terulang di tag teks lain (mis. StudyID) ikut diganti.
- **Tidak diubah:** tanggal study, UID, deskripsi, tag privat vendor, dan teks yang tertanam di
  gambar (burned-in).
- Setiap file diverifikasi ulang. Bila nama/ID asli masih tersisa (mis. di tag privat biner),
  seluruh unduhan dibatalkan.

> [!IMPORTANT]
> Ini **anonimisasi dasar, bukan de-identifikasi lengkap** menurut DICOM PS3.15. Periksa hasilnya
> sebelum dibagikan. Detail: [`src/features/dicom-anonymizer/README.md`](src/features/dicom-anonymizer/README.md).

### 7. Pasang & pakai offline

- **iPad:** buka demo di Safari, ketuk **Bagikan** lalu **Tambahkan ke Layar Utama**. Buka
  NeuroViewer dari Layar Utama sekali saat online sampai muncul *siap dipakai offline*. Aplikasi
  di Layar Utama menyimpan file terpisah dari tab Safari.
- **Chrome/Edge desktop:** tombol **Pasang** di kanan atas, atau ikon pasang di address bar.
- Setelah itu semua fitur berjalan tanpa internet, termasuk semua codec, MPR, dan 3D.
- **Versi baru** diunduh otomatis di latar belakang. Pemberitahuan *Versi baru tersedia*
  menawarkan **Muat ulang**. Memuat ulang menutup data yang sedang dibuka; pilih **Nanti** untuk
  memakai versi baru saat aplikasi dibuka berikutnya.

Detail: [`src/features/pwa/README.md`](src/features/pwa/README.md).

## Pengembangan

Prasyarat: Node.js 22.

```bash
npm ci            # instal dependensi sesuai package-lock
npm run dev       # server pengembangan (http://localhost:5173)
npm test          # unit test (vitest): geometri trajektori & anonimisasi
npm run build     # typecheck + build produksi ke dist/
npm run preview   # sajikan dist/ secara lokal
```

Service worker (offline) hanya aktif di build produksi. Untuk mencobanya: `npm run build` lalu
`npm run preview`, kemudian DevTools → Application → Service workers.

Stack: Vite + TypeScript, Cornerstone3D 5.14 (core, tools, dicom-image-loader), vtk.js (volume
rendering), dcmjs (baca/anonimisasi tag), fflate (ZIP).

Setiap fitur berada di `src/features/<nama>` dan punya README singkat:

| Folder | Isi |
| --- | --- |
| `dicom-loader` | Membaca file, Study → Series, urutan irisan, kelayakan volume |
| `series-browser` | Sidebar Study → Series dengan thumbnail |
| `stack-viewer` | Viewer 2D, tool, overlay |
| `window-presets` | Preset window CT kepala |
| `viewer-layout` | Toggle 1×1 ⇄ 2×2 |
| `mpr-viewer` | MPR, crosshair, oblik, sinkronisasi W/L, titik ekstensi |
| `volume-render` | Panel 3D (vtk.js) |
| `trajectory-planning` | Perencanaan trajektori & probe's eye |
| `export` | Screenshot PNG & ekspor JSON |
| `dicom-anonymizer` | Anonimisasi & unduh ulang DICOM |
| `pwa` | Service worker offline, manifest, pemasangan & pembaruan |

Aturan proyek ada di [`CLAUDE.md`](CLAUDE.md). Jangan pernah commit file DICOM asli; folder
`/sample` disediakan untuk dataset publik/anonim dan diabaikan git.

## Deploy ke GitHub Pages

Workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) menjalankan
`npm ci`, `npm test`, dan `npm run build` pada setiap push ke `main`, lalu men-deploy `dist/` ke
GitHub Pages. Pada pull request, workflow yang sama hanya menjalankan build dan test, tanpa deploy.

Aktivasi satu kali: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Build memakai path relatif (`base: './'`), sehingga aplikasi bekerja di subpath
`/NeuroView/` maupun domain kustom.

## Disclaimer

NeuroViewer disediakan "apa adanya" untuk tujuan edukasi. **Bukan untuk diagnosis klinis**,
perencanaan atau navigasi bedah, maupun keputusan klinis lain. Tidak ada jaminan akurasi
tampilan, pengukuran, rekonstruksi, perhitungan trajektori, atau kelengkapan anonimisasi.
Pengguna bertanggung jawab atas data yang dibuka dan dibagikan, termasuk kepatuhan terhadap
aturan privasi data pasien yang berlaku.
