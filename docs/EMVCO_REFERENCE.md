# Referensi EMVCo MPM & QRIS

> **Status sumber.** Bagian EMVCo disusun dari _EMV® QR Code Specification for
> Payment Systems — Merchant-Presented Mode, v1.1_ berdasarkan pengetahuan umum,
> **belum dicocokkan ulang baris per baris dengan dokumen asli**. Bagian QRIS
> ditandai `[QRIS-UNVERIFIED]` bila belum diverifikasi terhadap Standar QRIS
> ASPI/BI. Perbaiki dokumen ini jika ditemukan perbedaan dengan sumber primer.

## 1. Format TLV

```
TT LL V...V
│  │  └─ nilai, sepanjang LL karakter
│  └──── panjang, 2 digit desimal ("01".."99")
└─────── ID tag, 2 digit ("00".."99")
```

- Format nilai umumnya `N` (numerik), `ans` (alfanumerik + spesial), atau `S`
  (string, dapat mencakup karakter alternatif di tag 64).
- Payload dimulai dengan tag `00` dan diakhiri tag `63`.

## 2. Data object level atas

| Tag   | Nama                                     | Format | Panjang | Presence                 | Catatan                                                         |
| ----- | ---------------------------------------- | ------ | ------- | ------------------------ | --------------------------------------------------------------- |
| 00    | Payload Format Indicator                 | N      | 02      | M                        | Nilai `01`. Harus tag pertama                                   |
| 01    | Point of Initiation Method               | N      | 02      | O                        | `11` = statis (dipakai berulang), `12` = dinamis (sekali pakai) |
| 02–03 | Visa                                     | ans    | ≤99     | –                        | Dicadangkan per jaringan                                        |
| 04–05 | Mastercard                               | ans    | ≤99     | –                        |                                                                 |
| 06–08 | EMVCo                                    | ans    | ≤99     | –                        |                                                                 |
| 09–10 | Discover                                 | ans    | ≤99     | –                        |                                                                 |
| 11–12 | Amex                                     | ans    | ≤99     | –                        |                                                                 |
| 13–14 | JCB                                      | ans    | ≤99     | –                        |                                                                 |
| 15–16 | UnionPay                                 | ans    | ≤99     | –                        |                                                                 |
| 17–25 | EMVCo (RFU)                              | ans    | ≤99     | –                        |                                                                 |
| 26–51 | Merchant Account Information (template)  | ans    | ≤99     | M (min. satu dari 02–51) | Sub-tag `00` = Globally Unique Identifier                       |
| 52    | Merchant Category Code                   | N      | 04      | M                        | ISO 18245                                                       |
| 53    | Transaction Currency                     | N      | 03      | M                        | ISO 4217 numerik; IDR = `360`                                   |
| 54    | Transaction Amount                       | ans    | ≤13     | C                        | Jika tidak ada, pembayar mengisi nominal                        |
| 55    | Tip or Convenience Indicator             | N      | 02      | O                        | `01` minta tip, `02` fee tetap (56), `03` fee persen (57)       |
| 56    | Value of Convenience Fee Fixed           | ans    | ≤13     | C                        | Wajib jika 55 = `02`                                            |
| 57    | Value of Convenience Fee Percentage      | ans    | ≤05     | C                        | Wajib jika 55 = `03`                                            |
| 58    | Country Code                             | ans    | 02      | M                        | ISO 3166-1 alpha-2; `ID`                                        |
| 59    | Merchant Name                            | ans    | ≤25     | M                        |                                                                 |
| 60    | Merchant City                            | ans    | ≤15     | M                        |                                                                 |
| 61    | Postal Code                              | ans    | ≤10     | O                        |                                                                 |
| 62    | Additional Data Field Template           | S      | ≤99     | O                        | Lihat §3                                                        |
| 63    | CRC                                      | ans    | 04      | M                        | Harus tag terakhir. Lihat §5                                    |
| 64    | Merchant Information — Language Template | S      | ≤99     | O                        | Lihat §4                                                        |
| 65–79 | EMVCo (RFU) templates                    | S      | ≤99     | –                        |                                                                 |
| 80–99 | Unreserved templates                     | S      | ≤99     | O                        | Bebas untuk domain tertentu                                     |

### Format Transaction Amount (54)

Angka desimal dengan `.` sebagai pemisah desimal, tanpa pemisah ribuan, maksimal
13 karakter (misalnya `2000` atau `2000.00`). Untuk IDR, praktik umum adalah
bilangan bulat tanpa desimal `[QRIS-UNVERIFIED]`.

## 3. Additional Data Field Template (62)

| Sub-tag | Nama                              | Panjang                             |
| ------- | --------------------------------- | ----------------------------------- |
| 01      | Bill Number                       | ≤25                                 |
| 02      | Mobile Number                     | ≤25                                 |
| 03      | Store Label                       | ≤25                                 |
| 04      | Loyalty Number                    | ≤25                                 |
| 05      | Reference Label                   | ≤25                                 |
| 06      | Customer Label                    | ≤25                                 |
| 07      | Terminal Label                    | ≤25                                 |
| 08      | Purpose of Transaction            | ≤25                                 |
| 09      | Additional Consumer Data Request  | ≤03 (`A` alamat, `M` HP, `E` email) |
| 10–49   | RFU EMVCo                         |                                     |
| 50–99   | Payment-system specific templates |                                     |

Nilai `***` pada sub-tag 01–08 berarti pembayar diminta mengisi nilai tersebut.

## 4. Language Template (64)

| Sub-tag | Nama                                      |
| ------- | ----------------------------------------- |
| 00      | Language Preference (ISO 639, 2 karakter) |
| 01      | Merchant Name — Alternate Language        |
| 02      | Merchant City — Alternate Language        |

## 5. CRC

- Algoritma: CRC-16/CCITT-FALSE. Polinomial `0x1021`, init `0xFFFF`, tanpa
  refleksi input/output, XOR out `0x0000`.
- Dihitung atas seluruh payload **termasuk** `6304`, **tidak termasuk** 4
  karakter nilai CRC.
- Nilai ditulis sebagai 4 karakter heksadesimal, uppercase.
- Test vector: `crc("123456789") = 0x29B1`.

## 6. Spesifik QRIS `[QRIS-UNVERIFIED]`

Bagian ini berdasarkan praktik umum dan parser QRIS publik. **Harus diverifikasi**
terhadap Standar QRIS dan observasi sampel (Fase 5).

### Merchant Account Information domestik (26–45)

Struktur yang sering dijumpai:

| Sub-tag | Nama                       | Catatan                                         |
| ------- | -------------------------- | ----------------------------------------------- |
| 00      | Globally Unique Identifier | Reverse domain PJSP, mis. domain milik penerbit |
| 01      | Merchant PAN               | Diawali NNS (National Numbering System) PJSP    |
| 02      | Merchant ID                | ID merchant di sisi PJSP                        |
| 03      | Merchant Criteria          | `UMI`, `UKE`, `UME`, `UBE`, `URE`               |

### Template repositori nasional (51)

| Sub-tag | Nama              | Catatan                            |
| ------- | ----------------- | ---------------------------------- |
| 00      | GUI               | `ID.CO.QRIS.WWW`                   |
| 02      | NMID              | National Merchant ID, mis. `ID10…` |
| 03      | Merchant Criteria |                                    |

### Statis vs dinamis menurut spesifikasi

| Aspek      | Statis                             | Dinamis                                               |
| ---------- | ---------------------------------- | ----------------------------------------------------- |
| Tag 01     | `11`                               | `12`                                                  |
| Tag 54     | Tidak ada (pembayar input nominal) | Ada                                                   |
| Penggunaan | Berulang                           | Sekali (per transaksi)                                |
| Tag 62     | Opsional                           | Sering berisi referensi transaksi `[QRIS-UNVERIFIED]` |

**Catatan penting:** spesifikasi hanya mendefinisikan _format_ payload.
Konsep "sekali pakai", masa berlaku, dan pembatalan adalah perilaku **sistem
issuer/acquirer**, bukan sesuatu yang bisa dipaksakan atau dibuktikan oleh
payload itu sendiri.
