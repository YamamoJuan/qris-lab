# QRIS Lab

Tool riset CLI untuk mem-parse, menganalisis, membandingkan, memvalidasi, dan
meng-encode payload QR EMVCo Merchant-Presented Mode / QRIS.

> ⚠️ **Valid secara struktural ≠ terotorisasi.** CRC yang cocok tidak membuktikan
> keaslian payload atau bahwa transaksi dikenali issuer. QR yang dihasilkan tool
> ini adalah **QR uji**, bukan QRIS resmi yang diterbitkan GoPay atau PJSP mana pun.

## Status

| Fase | Isi                                             | Status |
| ---- | ----------------------------------------------- | ------ |
| 1    | Scaffold dan dokumentasi                        | ✅     |
| 2    | TLV parser, encoder, CRC                        | ✅     |
| 3    | Analyzer, comparator, decode QR                 | ✅     |
| 4    | Validator, konversi statis→dinamis, generate QR | ✅     |
| 5    | Validasi riset                                  | ⏳     |
| 6    | CLI                                             | ✅     |

## CLI

```bash
npm run build                      # kompilasi ke dist/
node dist/cli/index.js <command>   # atau: npm link → qris-lab <command>
npm run dev -- <command>           # tanpa build (tsx)
```

`INPUT` bisa berupa gambar QR (PNG/JPEG), file teks berisi payload, `-` (stdin),
atau payload langsung.

| Perintah                                     | Fungsi                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `decode <input>`                             | Struktur TLV (nested, panjang) dan status CRC. Exit 1 jika parse error   |
| `analyze <input>`                            | Ringkasan, merchant account, arti tiap tag, catatan                      |
| `validate <input>`                           | Validasi aturan EMVCo. Exit 1 jika tidak valid                           |
| `compare <a> <b>`                            | Diff struktural; `--all` untuk menampilkan tag yang sama                 |
| `encode <json>`                              | JSON `[{tag, value}]` / `[{tag, children}]` → payload (+CRC; `--no-crc`) |
| `generate <input> -o out.png`                | PNG QR **uji** berbanner TEST; `--ecl L/M/Q/H`, `--scale`, `--force`     |
| `generate <input> -o out.png --amount 15000` | Konversi statis → dinamis (hanya tag 01, 54, 63), lalu PNG uji           |

Opsi umum: `--mask` menyamarkan pengenal merchant/transaksi (untuk output yang
akan dibagikan); `--json` untuk output mesin (tidak disamarkan).

Exit code: `0` OK, `1` payload tidak valid, `2` kesalahan pemakaian/I/O.

Contoh:

```bash
qris-lab analyze samples/private/static.jpeg --mask
qris-lab compare samples/private/static.jpeg samples/private/dynamic.jpeg --mask
qris-lab generate samples/private/static.jpeg --amount 1000 -o out/test-1000.png
```

## Pengembangan

```bash
npm install
npm test           # vitest
npm run typecheck
npm run lint
npm run format
```

## Dokumentasi

- [PRD](docs/PRD.md)
- [Technical Plan](docs/TECHNICAL_PLAN.md)
- [Referensi EMVCo/QRIS](docs/EMVCO_REFERENCE.md)
- [Keamanan dan batasan riset](docs/SECURITY.md)
- [Temuan riset](docs/RESEARCH_FINDINGS.md)

## Sampel

Sampel QRIS asli disimpan di `samples/private/` (gitignored). Lihat
[samples/README.md](samples/README.md).
