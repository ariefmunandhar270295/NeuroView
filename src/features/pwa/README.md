# pwa

Menjadikan NeuroViewer Progressive Web App: bisa dipasang (iPad: *Tambahkan ke Layar Utama*;
Chrome/Edge: tombol *Pasang*) dan berjalan tanpa internet setelah dibuka sekali.

- **Service worker** (`service-worker.js`): menyimpan semua file aplikasi (HTML, JS, CSS, worker,
  codec WASM, ikon, manifest; ±6 MB) ke Cache Storage saat instalasi, lalu menyajikannya dari
  cache (cache-first). Request di luar scope aplikasi tidak disentuh. Data DICOM dibaca langsung
  dari `File` di browser, tidak pernah lewat jaringan, jadi tidak pernah masuk cache.
- **Daftar file & versi** (`vite-plugin.ts`): setelah build selesai, plugin membaca isi folder
  output dan menulis `sw.js` dari template. Versi berupa hash isi semua file, jadi `sw.js` hanya
  berubah bila aplikasi berubah. Service worker hanya didaftarkan di build produksi, bukan di
  `npm run dev`.
- **Pembaruan**: versi baru diunduh di latar belakang (saat aplikasi dibuka, kembali terlihat, dan
  tiap jam), lalu menunggu. Pemberitahuan *Versi baru tersedia* menawarkan **Muat ulang**; bila ada
  data terbuka, pengguna diingatkan bahwa data akan tertutup. Tanpa persetujuan, versi baru aktif
  saat aplikasi ditutup lalu dibuka lagi. Cache versi lama dihapus saat versi baru aktif.
- **Pemberitahuan** (toast di bawah layar): *siap dipakai offline* setelah instalasi pertama, dan
  *versi baru tersedia*. Setelah instalasi pertama aplikasi juga meminta penyimpanan persisten
  (`navigator.storage.persist`) agar cache tidak dihapus saat ruang penyimpanan menipis.
- **Pasang**: tombol *Pasang* muncul hanya bila browser menawarkan instalasi (`beforeinstallprompt`,
  Chrome/Edge). Safari iOS tidak punya API itu, jadi layar awal di iPad menampilkan petunjuk
  *Bagikan → Tambahkan ke Layar Utama*; petunjuk disembunyikan saat dibuka dari Layar Utama.
- **Ikon** (`public/icons`): `icon.svg` adalah sumbernya. PNG 192/512 (sudut membulat),
  `icon-maskable-512.png` (latar penuh, isi di zona aman 80%), dan `apple-touch-icon.png` (180 px,
  latar penuh karena iOS membulatkan sendiri) dirender dari SVG tersebut.

## Catatan iPad

- Aplikasi di Layar Utama memakai penyimpanan terpisah dari tab Safari. Buka sekali dari Layar
  Utama saat online sampai muncul *siap dipakai offline*; setelah itu bisa offline.
- Safari dapat menghapus data situs yang lama tidak dibuka. Bila itu terjadi, buka sekali saat
  online untuk mengunduh ulang.

## API

```ts
const pwa = setupPwa({ hasOpenData: () => loadedStudies.length > 0 });
header.append(pwa.installButton);                     // tersembunyi bila tidak bisa dipasang
if (pwa.installHint) emptyState.append(pwa.installHint); // hanya iPad/iPhone di browser
```

```ts
// vite.config.ts
plugins: [pwaServiceWorker()],
```
