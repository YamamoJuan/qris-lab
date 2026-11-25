# QRIS Lab

Tool riset berbasis terminal (CLI) untuk **membaca, membedah, membandingkan, dan
memvalidasi** kode QRIS, mengikuti standar EMVCo Merchant-Presented Mode.

Dengan tool ini kamu bisa:

- melihat isi sebenarnya dari sebuah QRIS (nama merchant, NMID, nominal, dll.);
- membandingkan QRIS **statis** dan **dinamis** untuk melihat bedanya;
- mengecek apakah sebuah payload QRIS valid secara struktur (termasuk CRC);
- membuat QR **uji** dari QRIS statis milikmu sendiri dengan nominal yang sudah
  terisi.

> ⚠️ **Penting dibaca**
>
> - Tool ini untuk **riset dan belajar**, dan hanya boleh dipakai pada QRIS
>   **milikmu sendiri**.
> - "Valid secara struktur" **tidak sama** dengan "resmi" atau "diotorisasi".
>   QR yang dibuat tool ini adalah **QR uji**, bukan QRIS dinamis resmi dari
>   GoPay atau penyedia lain.
> - Jangan memakai tool ini untuk menipu, meniru merchant lain, atau memalsukan
>   tagihan. Lihat [docs/SECURITY.md](docs/SECURITY.md).

---

## Daftar isi

1. [Yang perlu disiapkan](#1-yang-perlu-disiapkan)
2. [Instalasi](#2-instalasi)
3. [Menyiapkan gambar QRIS](#3-menyiapkan-gambar-qris)
4. [Cara pakai, langkah demi langkah](#4-cara-pakai-langkah-demi-langkah)
5. [Daftar perintah lengkap](#5-daftar-perintah-lengkap)
6. [Masalah yang sering muncul](#6-masalah-yang-sering-muncul)
7. [Untuk developer](#7-untuk-developer)
8. [Dokumentasi lain](#8-dokumentasi-lain)

---

## 1. Yang perlu disiapkan

| Kebutuhan                            | Keterangan                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Komputer                             | Linux, macOS, atau Windows                                                    |
| **Node.js versi 20 atau lebih baru** | Program untuk menjalankan tool ini                                            |
| **Git**                              | Untuk mengunduh (clone) proyek                                                |
| Terminal                             | Linux/macOS: aplikasi _Terminal_. Windows: _PowerShell_ atau _Command Prompt_ |

### Cek apakah Node.js dan Git sudah terpasang

Buka terminal, lalu ketik:

```bash
node --version
git --version
```

Kalau muncul angka versi (misalnya `v22.11.0` dan `git version 2.47.0`), lanjut ke
[Instalasi](#2-instalasi). Kalau muncul _command not found_ atau versi Node.js di
bawah 20, pasang dulu:

**Linux (Fedora)**

```bash
sudo dnf install nodejs git
```

**Linux (Ubuntu/Debian)**

```bash
sudo apt update
sudo apt install git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs
```

**macOS** (dengan [Homebrew](https://brew.sh))

```bash
brew install node git
```

**Windows**

1. Unduh Node.js versi **LTS** dari <https://nodejs.org> lalu instal (klik
   _Next_ sampai selesai).
2. Unduh Git dari <https://git-scm.com/download/win> lalu instal.
3. **Tutup lalu buka lagi** PowerShell supaya perintah `node` dan `git` dikenali.

---

## 2. Instalasi

Cukup dilakukan **sekali**.

```bash
# 1. Unduh proyek
git clone https://github.com/YamamoJuan/qris-lab.git

# 2. Masuk ke folder proyek
cd qris-lab

# 3. Pasang library yang dibutuhkan (butuh internet, ±1 menit)
npm install

# 4. Siapkan program agar siap dijalankan
npm run build
```

Cek apakah berhasil:

```bash
npm run qris -- --help
```

Kalau muncul daftar perintah (`decode`, `analyze`, `validate`, ...), instalasi
berhasil. 🎉

> 💡 **Cara membaca perintah di README ini**
>
> Semua perintah dijalankan **dari dalam folder `qris-lab`**. Formatnya:
>
> ```bash
> npm run qris -- <perintah> <file-atau-payload> [opsi]
> ```
>
> Tanda `--` setelah `npm run qris` **wajib ada**. Tanda ini memberi tahu npm
> bahwa sisa teks setelahnya adalah untuk QRIS Lab.

---

## 3. Menyiapkan gambar QRIS

Tool ini bisa membaca QRIS langsung dari **gambar** (PNG atau JPG/JPEG),
misalnya screenshot dari aplikasi.

### Contoh: QRIS dari GoPay Merchant

1. Buka aplikasi **GoPay Merchant** → menu **QRIS**.
2. **QRIS statis:** ambil screenshot halaman QRIS biasa (tanpa nominal).
3. **QRIS dinamis** (opsional, untuk perbandingan): tekan **"Buat tagihan QRIS
   pakai nominal"**, isi nominal, lalu ambil screenshot.
4. Pindahkan screenshot ke komputer, lalu simpan di folder
   **`samples/private/`** di dalam proyek. Beri nama yang mudah, misalnya:

   ```
   qris-lab/
   └── samples/
       └── private/
           ├── statis.jpg
           └── dinamis.jpg
   ```

> 🔒 Folder `samples/private/` **otomatis diabaikan Git**, jadi gambar QRIS-mu
> tidak akan ikut ter-upload ke GitHub. Tetap simpan gambar QRIS di folder ini
> karena isinya data asli merchant (nama, NMID, nomor rekening merchant).

Pastikan QR di screenshot **tajam dan utuh** (tidak terpotong, tidak blur).

---

## 4. Cara pakai, langkah demi langkah

Contoh output di bawah memakai **data contoh (fiktif)**. Output milikmu akan
berisi data merchant-mu sendiri.

### Langkah 1: Cek apakah QRIS valid

```bash
npm run qris -- validate samples/private/statis.jpg
```

Output:

```
STRUCTURALLY VALID

Note: structural validity is not proof that any issuer or acquirer issued or will authorise this payload.
```

- `STRUCTURALLY VALID` berarti formatnya benar dan CRC-nya cocok.
- `INVALID` berarti ada yang salah. Baris di bawahnya menjelaskan masalahnya.

### Langkah 2: Lihat isi QRIS

```bash
npm run qris -- analyze samples/private/statis.jpg
```

Output (dipotong):

```
Summary
  Initiation method : static
  Amount            : (not set — payer enters amount)
  Currency          : 360
  Country           : ID
  MCC               : 5814
  Merchant name     : TOKO CONTOH
  Merchant city     : JAKARTA

Merchant accounts
  26 (template) · GUI COM.EXAMPLE.WWW · PAN 999900000000000001 · ...
  51 (template) · GUI ID.CO.QRIS.WWW = QRIS national merchant repository · NMID ID0000000000001 · ...
```

Cara membacanya:

| Baris                         | Artinya                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `Initiation method : static`  | QRIS **statis**: bisa dipakai berkali-kali, pembeli mengetik nominal sendiri |
| `Initiation method : dynamic` | QRIS **dinamis**: ditujukan untuk satu transaksi                             |
| `Amount`                      | Nominal yang sudah tertanam di QR (kosong kalau statis)                      |
| `Currency : 360`              | Kode mata uang Rupiah (IDR)                                                  |
| `MCC`                         | Kode kategori usaha merchant                                                 |
| `NMID`                        | Nomor ID merchant nasional QRIS                                              |

Di bawahnya ada bagian **Fields** yang menampilkan **setiap tag** di dalam QRIS
beserta artinya.

> 💡 Mau membagikan hasilnya ke orang lain (misalnya untuk tanya-tanya)?
> Tambahkan `--mask` supaya nama, NMID, dan nomor merchant disamarkan:
>
> ```bash
> npm run qris -- analyze samples/private/statis.jpg --mask
> ```

### Langkah 3: Bandingkan QRIS statis dan dinamis

```bash
npm run qris -- compare samples/private/statis.jpg samples/private/dinamis.jpg
```

Output:

```
Legend: = same, ~ changed, - only in A, + only in B

  Tag     Name                                Len A→B   Values
~ 01      Point of Initiation Method          2→2       "11" → "12"
~ 62      Additional Data Field Template      12→24     (template)
~ 63      CRC                                 4→4       "E7AD" → "F9EB"
+ 54      Transaction Amount                  -→4       - → "2000"
+ 62.01   Bill Number                         -→8       - → "INV-0001"

Counts: 17 same, 3 changed, 0 only in A, 2 only in B
```

Arti simbol di kolom paling kiri:

| Simbol | Artinya                                          |
| ------ | ------------------------------------------------ |
| `~`    | Ada di kedua QR, tapi **isinya berbeda**         |
| `+`    | **Hanya ada** di QR kedua (B)                    |
| `-`    | **Hanya ada** di QR pertama (A)                  |
| `=`    | Sama persis (baru muncul kalau ditambah `--all`) |

### Langkah 4: Buat QR uji dengan nominal

Perintah ini mengambil QRIS **statis milikmu**, menanamkan nominal, lalu
menyimpannya sebagai gambar PNG.

```bash
npm run qris -- generate samples/private/statis.jpg --amount 1000 -o out/test-1000.png
```

Output:

```
LOCALLY MODIFIED TEST PAYLOAD — not issued by GoPay or any payment provider

Changes:
  01   11 → 12
  54   (absent) → 1000
  63   E7AD → ....

Limitations:
  - No provider transaction reference ...
  - No server-side expiry, single-use enforcement or cancellation.
  ...

Wrote TEST QR (6728 bytes, ECC M) to out/test-1000.png
```

Hasilnya ada di file **`out/test-1000.png`**. Gambarnya berisi QR dengan
**banner merah bertuliskan "TEST QR - RESEARCH ONLY"** di bawahnya.

Aturan penulisan nominal:

| ✅ Benar  | ❌ Salah                            |
| --------- | ----------------------------------- |
| `1000`    | `1.000` (jangan pakai titik ribuan) |
| `15000`   | `Rp15000` (jangan pakai "Rp")       |
| `1500.50` | `1,000` (jangan pakai koma)         |

Hal yang perlu kamu tahu tentang QR uji ini:

- Yang diubah **hanya** penanda "dinamis" dan nominal. Data merchant tetap sama,
  jadi pembayaran tetap mengarah ke merchant yang sama.
- QR ini **bukan tagihan resmi**. Tidak punya masa berlaku, tidak otomatis
  hangus setelah dibayar, dan tidak bisa dibatalkan dari aplikasi merchant.
  Kemungkinan besar QR ini **bisa dibayar berkali-kali**. Simpan baik-baik dan
  jangan disebar.
- Tool ini **menolak** mengubah QRIS dinamis resmi (yang dibuat lewat aplikasi
  GoPay), karena itu adalah tagihan yang masih aktif.
- Kalau file output sudah ada, tambahkan `--force` untuk menimpanya.

### Langkah 5 (opsional): Uji bayar

Kalau ingin membuktikan QR uji bisa dibayar, ikuti aturan di
[docs/SECURITY.md](docs/SECURITY.md) bagian _Prosedur uji live_:

1. Bayar dari akun e-wallet/bank **milikmu sendiri**.
2. Pakai nominal kecil (misalnya Rp 1.000).
3. Catat aplikasi yang dipakai, apakah nominal langsung terisi, dan apakah dana
   masuk ke dashboard merchant.

---

## 5. Daftar perintah lengkap

Format umum:

```bash
npm run qris -- <perintah> <input> [opsi]
```

`<input>` bisa berupa:

| Jenis input                          | Contoh                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| Gambar QR (PNG/JPG)                  | `samples/private/statis.jpg`                                   |
| File teks berisi payload             | `samples/private/payload.txt`                                  |
| Payload langsung (dalam tanda kutip) | `"000201010211..."`                                            |
| Stdin                                | `-` (misalnya `cat payload.txt \| npm run qris -- validate -`) |

| Perintah                         | Fungsi                                          | Opsi                                                |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `validate <input>`               | Cek format dan CRC                              | `--json`                                            |
| `analyze <input>`                | Penjelasan lengkap isi QRIS                     | `--mask`, `--json`                                  |
| `decode <input>`                 | Struktur mentah per tag (TLV) dan status CRC    | `--mask`, `--json`                                  |
| `compare <a> <b>`                | Bandingkan dua QRIS                             | `--all`, `--mask`, `--json`                         |
| `generate <input> -o <file.png>` | Buat gambar QR uji                              | `--amount`, `--ecl`, `--scale`, `--force`, `--mask` |
| `encode <file.json>`             | Susun payload dari file JSON (untuk eksperimen) | `--no-crc`                                          |

Penjelasan opsi:

| Opsi                 | Fungsi                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `--mask`             | Samarkan nama, kota, kode pos, NMID, PAN, MID, dan referensi transaksi |
| `--json`             | Output format JSON (untuk diproses program lain). **Tidak disamarkan** |
| `--all`              | Pada `compare`, tampilkan juga tag yang sama                           |
| `--amount <nominal>` | Pada `generate`, tanamkan nominal (ubah statis → dinamis)              |
| `-o <file>`          | Pada `generate`, lokasi file PNG hasil                                 |
| `--ecl L\|M\|Q\|H`   | Tingkat koreksi error QR (default `M`; `H` paling tahan rusak)         |
| `--scale <angka>`    | Ukuran tiap kotak QR dalam piksel (default `8`)                        |
| `--force`            | Timpa file output kalau sudah ada                                      |
| `--no-crc`           | Pada `encode`, jangan tambahkan CRC di akhir                           |

Bantuan untuk satu perintah:

```bash
npm run qris -- generate --help
```

Kode keluar (berguna untuk script): `0` = berhasil, `1` = QRIS tidak valid,
`2` = salah perintah atau file tidak ditemukan.

### Contoh file JSON untuk `encode`

```json
[
  { "tag": "00", "value": "01" },
  { "tag": "01", "value": "11" },
  { "tag": "62", "children": [{ "tag": "07", "value": "T01" }] }
]
```

```bash
npm run qris -- encode contoh.json
```

---

## 6. Masalah yang sering muncul

| Pesan / gejala                                                 | Penyebab                                        | Solusi                                                        |
| -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `command not found: node` / `npm`                              | Node.js belum terpasang                         | Lihat [bagian 1](#1-yang-perlu-disiapkan)                     |
| `Cannot find module '.../dist/cli/index.js'`                   | Belum di-build                                  | Jalankan `npm run build`                                      |
| Opsi seperti `--mask` tidak berpengaruh                        | Lupa tanda `--`                                 | Tulis `npm run qris -- analyze ...` (ada `--` setelah `qris`) |
| `No QR code found in image`                                    | Gambar blur, terpotong, atau terlalu kecil      | Ambil screenshot ulang, atau crop di sekitar QR saja          |
| `Unsupported image format`                                     | Bukan PNG/JPG (misalnya HEIC dari iPhone, WEBP) | Konversi ke PNG/JPG dulu                                      |
| `... already exists (use --force to overwrite)`                | File output sudah ada                           | Tambahkan `--force` atau ganti nama file                      |
| `Invalid amount`                                               | Format nominal salah                            | Pakai angka saja: `1000`, bukan `1.000` / `Rp1000`            |
| `Source contains a payment-system-specific value at 62.50 ...` | Input adalah QRIS dinamis resmi                 | `--amount` hanya bisa untuk QRIS **statis**                   |
| `CRC mismatch` / `INVALID`                                     | Payload rusak atau salah salin                  | Pakai gambar asli, atau salin ulang payload dengan teliti     |
| Path file berisi spasi tidak terbaca                           | Spasi memecah argumen                           | Bungkus dengan tanda kutip: `"samples/private/QR saya.jpg"`   |

---

## 7. Untuk developer

```bash
npm install
npm run build        # kompilasi TypeScript ke dist/
npm run dev -- <cmd> # jalankan CLI tanpa build (tsx)
npm test             # unit test (vitest)
npm run typecheck
npm run lint
npm run format
```

Opsional, supaya perintah `qris-lab` bisa dipanggil langsung dari mana saja:

```bash
npm link
qris-lab analyze samples/private/statis.jpg
```

Struktur kode:

```
src/
  core/         TLV parser/encoder, CRC-16, kamus tag EMVCo, decode gambar QR
  analyzers/    analisis payload, merchant account, komparator
  validators/   validasi CRC dan aturan EMVCo
  generators/   konversi statis→dinamis, pembuat PNG QR uji
  cli/          antarmuka command line
tests/          unit test (hanya data fiktif)
```

Status fase pengembangan:

| Fase | Isi                                             | Status |
| ---- | ----------------------------------------------- | ------ |
| 1    | Scaffold dan dokumentasi                        | ✅     |
| 2    | TLV parser, encoder, CRC                        | ✅     |
| 3    | Analyzer, comparator, decode QR                 | ✅     |
| 4    | Validator, konversi statis→dinamis, generate QR | ✅     |
| 5    | Validasi riset                                  | ⏳     |
| 6    | CLI                                             | ✅     |

---

## 8. Dokumentasi lain

- [Temuan riset](docs/RESEARCH_FINDINGS.md): hasil perbandingan statis vs
  dinamis dan uji bayar
- [Keamanan dan batasan riset](docs/SECURITY.md)
- [Referensi EMVCo/QRIS](docs/EMVCO_REFERENCE.md): arti setiap tag
- [PRD](docs/PRD.md)
- [Technical Plan](docs/TECHNICAL_PLAN.md)
- [Tentang folder sampel](samples/README.md)
