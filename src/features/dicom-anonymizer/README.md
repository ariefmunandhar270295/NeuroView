# dicom-anonymizer

Menu **Ekspor → Anonimkan & unduh DICOM…**: menganonimkan file DICOM yang sudah dibuka lalu
mengunduhnya kembali sebagai ZIP. Semua proses berjalan di browser dengan dcmjs; tidak ada yang
diunggah.

## Yang diubah

| Tag                                   | Tindakan                                             |
| ------------------------------------- | ---------------------------------------------------- |
| PatientName (0010,0010)               | diganti `ANONIM`                                     |
| PatientID (0010,0020)                 | diganti pseudonim acak `ANON-XXXXXX` (sama untuk satu unduhan) |
| PatientBirthDate (0010,0030)          | dikosongkan (tag Type 2 tetap ada)                   |
| PatientBirthTime (0010,0032)          | dihapus                                              |
| InstitutionName / Address / InstitutionalDepartmentName (0008,0080/0081/1040) | dihapus |
| OtherPatientIDs / OtherPatientNames / OtherPatientIDsSequence (0010,1000/1001/1002) | dihapus |
| PatientAddress (0010,1040), PatientTelephoneNumbers (0010,2154) | dihapus                       |
| Nama/ID pasien yang terulang di tag teks lain, termasuk di dalam sequence (mis. StudyID yang sama dengan PatientID, komentar) | diganti `ANONIM` / pseudonim. ID tanpa huruf hanya diganti bila nilainya sama persis |
| DeidentificationMethod (0012,0063)    | ditambahkan: "NeuroViewer: anonimisasi dasar (bukan profil PS3.15)" |

Piksel dan semua tag lain tidak disentuh. Untuk data terkompresi (JPEG, JPEG 2000, RLE, …)
dcmjs dapat mengisi *Basic Offset Table* yang semula kosong; isi frame terkompresi tetap identik
byte per byte, dan transfer syntax tidak berubah.

## Yang TIDAK diubah (penting)

Tanggal & jam study, UID, deskripsi study/series, tag privat vendor, isi sequence, dan teks yang
tertanam di piksel (burned-in). **Ini bukan de-identifikasi lengkap menurut DICOM PS3.15.**
Periksa hasilnya sebelum dibagikan. Daftar yang sama tercantum di dialog dan di file
`BACA-SAYA.txt` di dalam ZIP.

## Keamanan (fail closed)

Setiap file hasil dibaca ulang dan diverifikasi:
- nama dan ID sudah diganti;
- tanggal lahir kosong;
- tag yang harus dihapus sudah tidak ada;
- nama/ID pasien asli (yang mengandung huruf) tidak tersisa di bagian mana pun dalam file.
  Sisa di data biner, misalnya tag privat vendor, tidak bisa dibersihkan sehingga file ditolak.

Pengaman ini terbukti berguna saat pengujian: pada file contoh publik pydicom, PatientID juga
tertulis di StudyID. Karena itu nilai yang terulang di tag teks kini ikut diganti.

Bila satu file saja gagal, seluruh unduhan dibatalkan dan tidak ada file yang keluar.
Elemen yang diganti ditulis ulang utuh, karena dcmjs menyimpan nilai asli di `_rawValue`.

## Cakupan & format

Pilihannya **series yang sedang tampil** atau **seluruh study**. ZIP dibuat streaming tanpa
kompresi (fflate) agar hemat memori, dengan struktur
`neuroviewer-anonim/S<nomor series>-<modalitas>/IM0001.dcm`. Nama folder sengaja tidak memakai
deskripsi series.

## Uji

Pengujian E2E memverifikasi hasil ZIP secara independen dengan pydicom, mencakup data sintetis
kaya PHI dan file contoh publik dalam 5 transfer syntax. `anonymize.test.ts` (vitest) memeriksa:
- tag diganti, dikosongkan, dan dihapus sesuai tabel;
- nilai asli tidak ada di byte output;
- piksel dan tag lain identik;
- tag opsional yang tidak ada tidak membuat proses gagal;
- nama/ID yang terulang di tag teks lain (StudyID, komentar) ikut diganti, sedangkan ID numerik
  hanya diganti bila sama persis;
- proses gagal bila nama tersisa di data biner tag privat;
- ID berupa angka yang kebetulan ada di UID tidak dianggap bocor.
