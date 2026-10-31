# shared

Modul UI kecil yang dipakai lebih dari satu fitur (bukan fitur tersendiri).

- `viewport-overlay.ts` — teks info di sudut viewport (series, bidang, irisan ke-N, preset,
  WW/WL). Sengaja tanpa identitas pasien. Dipakai `stack-viewer` dan `mpr-viewer`.
- `download.ts` — unduh Blob sebagai file (`downloadBlob`) dan cap waktu nama file
  (`fileTimestamp`). Dipakai ekspor PNG/JSON dan rencana trajektori.
- `disclaimer.ts` — teks "Bukan untuk diagnosis klinis" yang tampil di aplikasi dan ikut di
  setiap ekspor.
