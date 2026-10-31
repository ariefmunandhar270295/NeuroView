# NeuroViewer
Viewer DICOM berbasis web untuk edukasi dan perencanaan bedah saraf, terinspirasi Horos/Brainlab.

## Stack
- Vite + TypeScript
- Cornerstone3D (@cornerstonejs/core, tools, dicom-image-loader)
- vtk.js untuk volume rendering
- dcmjs untuk baca/anonimisasi tag

## Aturan
- Semua proses DICOM di browser (client-side), tidak ada upload ke server.
- Jangan pernah commit file DICOM asli; pakai dataset publik/anonim di /sample (gitignore).
- UI harus jalan di iPad Safari dan desktop Chrome (touch + mouse).
- Setiap fitur: kode modular di /src/features/<nama>, ada README singkat.
- Jalankan `npm run build` tanpa error sebelum commit.
- Commit kecil dan deskriptif; buat PR per fitur.
