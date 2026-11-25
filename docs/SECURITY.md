# Keamanan & Batasan Riset

## 1. Data sensitif

Payload QRIS asli berisi pengenal merchant: NMID, Merchant PAN, Merchant ID,
nama, dan kota. QRIS dinamis yang diterbitkan GoPay adalah **permintaan
pembayaran live** sampai kedaluwarsa atau dibatalkan.

Aturan:

- Sampel asli **hanya** di `samples/private/` (gitignored). Jangan pindahkan ke
  `tests/`, `docs/`, atau commit message.
- Jangan menempelkan payload asli ke issue, PR, chat publik, atau layanan pihak
  ketiga (termasuk decoder QR online).
- Dokumentasi temuan menggunakan nilai yang **disamarkan** (mis.
  `ID10XXXXXXXXXXX`, `<MERCHANT_NAME>`).
- Unit test hanya menggunakan payload sintetis dengan merchant fiktif.
- Tidak ada kredensial API di repo. Jika kelak ada integrasi resmi, kredensial
  disimpan di `.env` (gitignored).

## 2. Batasan riset

Diperbolehkan:

- Menganalisis QRIS milik merchant sendiri.
- Membuat payload uji yang valid secara struktural untuk dipelajari offline.
- Menghasilkan PNG QR uji yang **selalu** diberi label TEST.

Tidak diperbolehkan:

- Membuat QR pembayaran yang menyesatkan, atau memasang QR uji di tempat yang
  dapat dipindai publik.
- Mengganti identitas merchant (nama, PAN, NMID, MID) dengan milik pihak lain.
- Memalsukan referensi transaksi yang seolah-olah diterbitkan issuer.
- Melewati autentikasi atau otorisasi GoPay, atau melakukan reverse engineering
  terhadap API privat aplikasi GoPay.
- Uji pembayaran live tanpa integrasi resmi dan prosedur terkontrol.

## 3. Batasan yang ditegakkan di kode

- `staticToDynamic` hanya mengubah tag 01, 54, dan 63. Tidak ada fungsi untuk
  mengganti identitas merchant.
- `staticToDynamic` menolak payload yang sudah berisi nilai provider di
  62.50–99. QR dinamis yang diterbitkan provider adalah tagihan live, jadi
  tidak boleh dimodifikasi.
- Tidak ada fungsi untuk membuat atau meniru referensi transaksi provider.
- `generateTestQrPng` menolak payload yang tidak valid, selalu menambahkan
  banner merah "TEST QR - RESEARCH ONLY / NOT ISSUED BY ANY PROVIDER", dan
  menyisipkan komentar PNG (tEXt) dengan keterangan yang sama.

## 4. Interpretasi hasil

- **CRC valid bukan bukti keaslian.** CRC hanya mendeteksi kesalahan transmisi;
  siapa pun dapat menghitungnya ulang. Tidak ada tanda tangan kriptografis di
  payload QRIS MPM.
- **Valid secara struktural bukan berarti terotorisasi.** Tool ini tidak bisa
  mengetahui apakah sebuah transaksi tercatat di sistem issuer/acquirer.
- Output tool tidak boleh menyebut payload hasil modifikasi lokal sebagai
  "QRIS dinamis GoPay" atau "QRIS resmi".

## 5. Prosedur uji live (jika suatu saat diperlukan)

Hanya boleh dilakukan jika **semua** kondisi berikut terpenuhi:

1. Merchant dan akun pembayar sama-sama milik peneliti.
2. Nominal minimal.
3. Dicatat: waktu, payload (disamarkan), aplikasi pembayar, hasil, dan bukti
   mutasi di dashboard merchant.
4. Dilakukan sesuai syarat dan ketentuan layanan yang berlaku.

Tujuan uji seperti ini adalah memahami perilaku sistem, bukan mencari celah.
