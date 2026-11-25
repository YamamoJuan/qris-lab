# PRD — QRIS Lab

## 1. Ringkasan

QRIS Lab adalah tool riset berbasis CLI (TypeScript/Node.js) untuk membaca,
mendekode, menganalisis, membandingkan, memvalidasi, dan meng-encode payload QR
berbasis **EMVCo Merchant-Presented Mode (MPM)**, dengan subjek riset utama
QRIS yang diterbitkan melalui **GoPay Merchant**.

Prinsip utama: **validitas struktural ≠ otorisasi pembayaran.** Payload dengan
TLV yang benar dan CRC yang cocok tidak membuktikan bahwa transaksi tersebut
dikenali, diotorisasi, atau direkonsiliasi oleh issuer/acquirer.

## 2. Masalah

Payload QRIS adalah string TLV yang tidak terbaca manusia. Untuk memahami
perbedaan QRIS statis dan dinamis, peneliti perlu:

- membedah struktur TLV termasuk template bersarang;
- memvalidasi CRC;
- membandingkan dua payload secara terstruktur;
- membuat payload uji yang valid secara struktural, dengan label jelas sebagai
  _test_.

## 3. Pengguna

- Pemilik/peneliti merchant yang menganalisis QRIS milik sendiri.
- Developer yang mempelajari interoperabilitas EMVCo/QRIS.

## 4. Tujuan (in scope)

| #   | Kemampuan                                                             | Fase |
| --- | --------------------------------------------------------------------- | ---- |
| G1  | Parse TLV EMVCo, termasuk template bersarang, dengan error berposisi  | 2    |
| G2  | Encode TLV dengan panjang otomatis dan validasi batas panjang         | 2    |
| G3  | CRC-16/CCITT-FALSE: hitung, ekstrak, validasi                         | 2    |
| G4  | Analisis tag (00, 01, 26–51, 52–64) dengan penjelasan                 | 3    |
| G5  | Analisis Merchant Account Information (GUI, PAN, MID, kriteria)       | 3    |
| G6  | Komparasi dua payload (struktur, nilai, panjang, CRC)                 | 3    |
| G7  | Decode payload dari gambar QR (PNG/JPEG)                              | 4    |
| G8  | Generate PNG QR dari payload uji, ECC dapat diatur, berlabel TEST     | 4    |
| G9  | Dokumentasi temuan riset dengan kategori bukti yang jelas             | 5    |
| G10 | CLI: `decode`, `analyze`, `compare`, `validate`, `encode`, `generate` | 6    |

## 5. Non-goals (out of scope)

- Membuat QRIS dinamis yang "resmi" atau mengklaim payload hasil modifikasi
  lokal sebagai QRIS yang diterbitkan GoPay.
- Mengganti identitas merchant (impersonasi) atau memalsukan referensi transaksi.
- Melewati autentikasi/otorisasi GoPay, atau memanggil API GoPay tanpa
  integrasi resmi.
- Uji pembayaran live tanpa prosedur terkontrol dan integrasi resmi.
- Frontend/GUI pada fase awal.

## 6. Pertanyaan riset

**Utama:** Apakah payload QRIS statis GoPay Merchant dapat ditransformasi secara
lokal menjadi payload QRIS dinamis yang diterima sebagai transaksi terotorisasi
oleh infrastruktur pembayaran GoPay?

Sub-pertanyaan: lihat `RESEARCH_FINDINGS.md` §2.

## 7. Kriteria keberhasilan

1. Parser dan CRC lulus seluruh unit test dengan payload sintetis dan test vector
   standar.
2. Payload sampel asli (lokal, tidak di-commit) dapat diparse tanpa error dan
   CRC-nya tervalidasi.
3. Komparator menampilkan perbedaan statis dan dinamis secara akurat.
4. Setiap output yang dihasilkan tool selalu membedakan _valid secara struktural_
   dari _terotorisasi_.
5. Setiap temuan riset diberi label sumber: spesifikasi / observasi sampel /
   dokumentasi GoPay / hipotesis.

## 8. Asumsi

- A1. Panjang field EMVCo dihitung dalam **karakter** (2 digit desimal, 01–99).
- A2. CRC dihitung atas byte UTF-8 dari seluruh payload hingga dan termasuk
  `6304`. Untuk payload ASCII murni, karakter = byte.
- A3. Template (26–51, 62, 64, 80–99) _biasanya_ berisi TLV bersarang, tetapi
  parser tidak boleh mengasumsikannya. Jika isi template tidak bisa diparse
  sebagai TLV, nilai disimpan mentah dan diberi peringatan.
- A4. Detail sub-tag khusus QRIS diambil dari pengetahuan umum dan observasi
  sampel; **belum diverifikasi terhadap dokumen Standar QRIS (ASPI/BI)**.

## 9. Pertanyaan terbuka

- Q1. Akses ke dokumen primer: EMVCo MPM v1.1 dan Standar Teknis QRIS ASPI.
- Q2. Perilaku panjang untuk karakter non-ASCII (tag 64 atau nama merchant).
- Q3. Apakah GoPay menyediakan API resmi untuk QRIS dinamis bagi merchant
  GoPay Merchant (bukan hanya melalui Midtrans)?
