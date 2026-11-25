# Technical Plan — QRIS Lab

## 1. Stack

| Aspek       | Pilihan                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| Bahasa      | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Runtime     | Node.js ≥ 20 (dev: v22), ESM (`"type": "module"`, `NodeNext`)                 |
| Test        | Vitest                                                                        |
| Lint/format | ESLint (flat config, `typescript-eslint` strict) + Prettier                   |
| CLI         | `commander`                                                                   |
| QR generate | `qrcode` (PNG, ECC L/M/Q/H)                                                   |
| QR decode   | `jsqr` + `jpeg-js` / `pngjs` (pure JS, tanpa binary native)                   |
| Dev runner  | `tsx`                                                                         |

TLV parser, encoder, dan CRC ditulis sendiri **tanpa dependency** karena
merupakan inti riset dan harus bisa diaudit.

## 2. Struktur

```
src/
  types/qris.ts                  tipe bersama (TlvNode, ParseError, dst.)
  core/tlv-parser.ts             string -> TlvNode[] (+ nested)
  core/tlv-encoder.ts            TlvNode[] -> string
  core/crc16.ts                  CRC-16/CCITT-FALSE
  core/qr-parser.ts              gambar -> string payload
  validators/crc-validator.ts    ekstraksi dan validasi tag 63
  validators/payload-validator.ts aturan struktural EMVCo/QRIS
  analyzers/payload-analyzer.ts  tag -> nama, deskripsi, interpretasi
  analyzers/merchant-analyzer.ts tag 26–51
  analyzers/payload-comparator.ts diff dua payload
  generators/payload-generator.ts bangun payload uji + CRC
  generators/qr-generator.ts     payload -> PNG
  cli/index.ts
tests/                           hanya payload sintetis
samples/private/                 sampel asli (gitignored)
```

## 3. Model data

```ts
interface TlvNode {
  tag: string; // 2 digit, "00".."99"
  length: number; // nilai yang tertulis di payload
  value: string; // nilai mentah
  offset: number; // posisi awal tag di string induk (absolut)
  children?: TlvNode[]; // hanya jika template berhasil diparse sebagai TLV
}

interface TlvParseIssue {
  severity: 'error' | 'warning';
  code: string; // mis. 'TRUNCATED_VALUE', 'INVALID_LENGTH'
  message: string;
  offset: number; // posisi absolut di payload
}

interface TlvParseResult {
  nodes: TlvNode[];
  issues: TlvParseIssue[];
}
```

Keputusan desain:

- **Parser toleran, bukan fail-fast.** Parser mengembalikan node yang berhasil
  dibaca beserta daftar issue. Varian `parseTlvStrict` melempar error pada issue
  pertama yang bersifat `error`.
- **Urutan dipertahankan** (array, bukan map). Tag duplikat dilaporkan sebagai
  warning, tidak ditimpa.
- **Nested parsing hanya untuk tag template** (26–51, 62, 64, 80–99) dan hanya
  jika seluruh nilai habis terbaca sebagai TLV yang valid. Jika tidak, nilai
  dibiarkan mentah dengan warning `TEMPLATE_NOT_TLV`.
- **Offset absolut** dihitung untuk child juga, agar pesan error bisa menunjuk
  posisi di payload asli.
- **Encoder** menghitung panjang dari `children` jika ada, atau dari `value`.
  Encoder menolak tag di luar `00`–`99`, panjang 0 atau lebih dari 99, dan
  nilai yang berisi karakter di luar Unicode yang dapat dienkode.
- **CRC**: `crc16(payloadUpTo6304)` → string hex 4 karakter uppercase. Validator
  mengecek bahwa `6304` adalah tag terakhir dan berada di posisi `len - 8`.

## 4. Panjang: karakter vs byte

EMVCo mendefinisikan panjang sebagai jumlah karakter. Parser menggunakan indeks
string JS (UTF-16 code unit). Untuk payload ASCII hasilnya identik. Jika
ditemukan karakter non-ASCII, parser memberi warning `NON_ASCII` karena
interpretasi panjang menjadi ambigu (lihat PRD Q2). CRC selalu dihitung atas
byte UTF-8.

## 5. Strategi pengujian

- Test vector CRC standar: `"123456789"` → `0x29B1`.
- Payload sintetis dibangun di test helper (merchant fiktif, NMID fiktif).
- Round-trip: `encode(parse(x)) === x` untuk payload valid.
- Kasus malformed: panjang non-digit, nilai terpotong, tag non-digit, payload
  kosong, CRC salah, CRC tidak di akhir, template bukan TLV.
- **Tidak ada payload asli di test.** Verifikasi terhadap sampel asli dilakukan
  manual lewat CLI di `samples/private/`.

## 6. Fase

| Fase | Isi                                                                               | Status                              |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------- |
| 0    | Assessment                                                                        | selesai                             |
| 1    | Scaffold dan dokumentasi                                                          | selesai                             |
| 2    | TLV parser, encoder, CRC, CRC validator + test                                    | selesai                             |
| 3    | Analyzer, merchant analyzer, comparator, decode gambar QR (dimajukan dari Fase 4) | selesai                             |
| 4    | Payload validator, konversi statis→dinamis, generate PNG                          | selesai                             |
| 5    | Validasi riset dan `RESEARCH_FINDINGS.md`                                         | berikutnya                          |
| 6    | CLI                                                                               | selesai (dikerjakan sebelum Fase 5) |

Setiap fase diakhiri dengan `npm run typecheck && npm run lint && npm test`.

## 7. Catatan implementasi Fase 2

- `parseTlv` menghitung panjang dan offset dalam **code point Unicode**
  (`Array.from`), bukan UTF-16 code unit, agar karakter di luar BMP tidak
  terhitung dua.
- Kode issue parser: `EMPTY`, `TRUNCATED_HEADER`, `INVALID_TAG`,
  `INVALID_LENGTH`, `TRUNCATED_VALUE` (fatal, parsing level itu berhenti);
  `ZERO_LENGTH` (error, parsing lanjut); `DUPLICATE_TAG`, `TEMPLATE_NOT_TLV`,
  `NON_ASCII` (warning).
- Aturan template default: root `26–51`, `62`, `64–99`; di dalam `62`, sub-tag
  `50–99`. Dapat diganti lewat opsi `isTemplate`.
- Encoder hanya menegakkan batasan generik (tag 2 digit, panjang 01–99). Batas
  per tag (mis. tag 59 ≤ 25) ada di `payload-validator` (Fase 4).
- `encodePayload` membuang tag 63 dari input dan menambahkan CRC baru di akhir.
- `validateCrc` mencari tag 63 berdasarkan posisi (8 karakter terakhir), sesuai
  aturan EMVCo bahwa CRC adalah data object terakhir.
- Vektor CRC untuk test dihitung secara independen dengan Python
  `binascii.crc_hqx(data, 0xFFFF)`.

## 8. Catatan implementasi Fase 3

- `src/core/emv-tags.ts` adalah kamus tag tunggal (nama, format, panjang,
  sumber definisi) yang dipakai analyzer, comparator, dan nanti validator.
  Entri QRIS ditandai `qris-unverified`, entri dari sampel `observed`.
- `qr-parser.ts` (decode PNG/JPEG → payload) dimajukan dari Fase 4 agar
  analyzer bisa diuji pada sampel asli. Format gambar dideteksi dari magic
  bytes, bukan ekstensi.
- `analyzePayload` selalu menyertakan `STRUCTURAL_DISCLAIMER` di `notes`.
- Template yang isinya bukan TLV (mis. 62.50 pada sampel GoPay) ditandai
  `opaque: true` dan tidak dianggap error.
- `comparePayloads` murni struktural. Kunci entri berupa path bertitik
  (`62.07`); tag berulang diberi akhiran `#2`, `#3`, dst.

## 9. Catatan implementasi Fase 4

- `validatePayload`: menjalankan parse, mengecek posisi (00 pertama, 63
  terakhir), tag wajib, minimal satu merchant account, tag duplikat, panjang
  dan format numerik per tag (termasuk tag bersarang), CRC, nilai 00/01/54/55/58,
  serta aturan 55→56/57. Inkonsistensi POI vs 54 hanya menjadi warning.
- `staticToDynamic`: memvalidasi sumber, menolak sumber yang berisi 62.50–99,
  mengubah 01 menjadi `12` (atau menyisipkannya setelah 00), menyisipkan atau
  mengganti 54 di posisi urut, lalu menghitung ulang CRC. Mengembalikan
  `changes`, `validation`, `label`, dan `limitations`.
- Format nominal yang diterima: bilangan positif, maksimal 13 karakter, maksimal
  2 angka desimal.
- `generateTestQrPng`: memakai `qrcode` untuk membuat QR, lalu menambahkan
  banner merah dengan font bitmap 5×7 bawaan (tanpa dependency font) dan chunk
  PNG `tEXt` `Comment`. QR tetap bisa dipindai karena banner berada di luar
  quiet zone.

## 10. Catatan implementasi Fase 6 (CLI)

- Fase 6 dikerjakan sebelum Fase 5 karena uji terkontrol di Fase 5 lebih mudah
  dilakukan lewat CLI.
- `src/cli/program.ts` mengekspor `main(argv, io)` yang mengembalikan exit code,
  sehingga test tidak perlu spawn proses. `src/cli/index.ts` hanya entry point.
- `src/cli/input.ts`: gambar dideteksi dari magic bytes; file lain dibaca sebagai
  teks; jika argumen bukan file, argumen itu sendiri dianggap payload.
- `src/cli/mask.ts`: menyamarkan 02–25, 59, 60, 61, sub-tag 26–51 selain 00/03,
  sub-tag 62 selain 07/09, dan 64.01/02 (4 karakter pertama dipertahankan,
  panjang tetap). Payload mentah disembunyikan. `--json` tidak disamarkan.
- `generate` menolak menimpa file tanpa `--force`.
