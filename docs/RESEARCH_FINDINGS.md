# Temuan Riset

> Setiap temuan wajib diberi label sumber:
> **[SPEC]** dikonfirmasi spesifikasi · **[SAMPLE]** observasi sampel ·
> **[GOPAY-DOC]** didokumentasikan GoPay · **[HYPOTHESIS]** perlu diuji.
> Nilai pengenal merchant di dokumen ini selalu disamarkan.

## 1. Sampel

| ID  | Jenis             | Sumber                             | Lokasi (lokal, gitignored)                |
| --- | ----------------- | ---------------------------------- | ----------------------------------------- |
| S1  | Statis            | Screenshot aplikasi GoPay Merchant | `samples/private/gopay-static.jpeg`       |
| S2  | Dinamis, Rp 2.000 | Screenshot aplikasi GoPay Merchant | `samples/private/gopay-dynamic-2000.jpeg` |

Kedua sampel berasal dari merchant yang sama (NMID sama, disamarkan
`ID10XXXXXXXXXXX`).

## 2. Pertanyaan riset

1. Perbedaan QRIS statis dan dinamis.
2. Perilaku Point of Initiation Method (tag 01).
3. Representasi Transaction Amount (tag 54).
4. Struktur Merchant Account Information (26–51).
5. Struktur Additional Data Field (62).
6. Pengenal referensi transaksi.
7. Kebutuhan perhitungan ulang CRC.
8. Apakah diperlukan otorisasi atau data transaksi dari sisi issuer.
9. Apakah GoPay menyediakan integrasi resmi untuk QRIS dinamis.

## 3. Temuan awal (Fase 1, dari UI aplikasi saja, payload belum didekode)

- **[SAMPLE]** Pada S2, aplikasi GoPay Merchant menampilkan teks _"Berlaku hanya
  untuk 1x transaksi hingga 26 Nov 2026 09:08 WIB"_ dan tombol **Batalkan**.
  Artinya QRIS dinamis GoPay memiliki **state di sisi server**: masa berlaku
  sekitar 24 jam, sekali pakai, dan bisa dibatalkan.
- **[SAMPLE]** S1 menyediakan tombol _"Buat tagihan QRIS pakai nominal"_. QRIS
  dinamis dibuat **oleh aplikasi/server GoPay**, bukan diturunkan secara lokal.
- **[HYPOTHESIS]** Karena status "sekali pakai" dan "kedaluwarsa" adalah state
  server, payload statis yang dimodifikasi lokal (01 → `12`, tambah 54, CRC
  dihitung ulang) **tidak akan** memiliki state tersebut. Payload seperti itu
  kemungkinan diproses seperti QRIS statis dengan nominal terisi otomatis,
  tanpa referensi tagihan, masa berlaku, atau pembatalan. Perlu diverifikasi
  dengan membandingkan payload S1 dan S2 (Fase 3/5).

## 4. Struktur payload S1 vs S2 (Fase 3)

Didekode dari gambar dengan `qr-parser` lalu dianalisis dengan `payload-analyzer`
dan `payload-comparator`. Nilai pengenal merchant disamarkan.

```
Tag     S1 (statis)                 S2 (dinamis)                Status
00      01                          01                          sama
01      11                          12                          BERBEDA
26      [61]                        [61]                        sama
  26.00 COM.GO-JEK.WWW              COM.GO-JEK.WWW              sama
  26.01 93600914XXXXXXXXXX (18)     sama                        sama
  26.02 GXXXXXXXXX (10)             sama                        sama
  26.03 UMI                         UMI                         sama
51      [44]                        [44]                        sama
  51.00 ID.CO.QRIS.WWW              ID.CO.QRIS.WWW              sama
  51.02 ID10XXXXXXXXXXX (15)        sama                        sama
  51.03 UMI                         UMI                         sama
52      <MCC>                       sama                        sama
53      360                         360                         sama
54      –                           2000                        hanya S2
58      ID                          ID                          sama
59      <NAME, 25 char>             sama                        sama
60      <CITY, 15 char>             sama                        sama
61      <POSTAL>                    sama                        sama
62      [7]                         [39]                        BERBEDA
  62.50 –                           A3 20261125020820 XXXXXXXXXXXX (28)  hanya S2
  62.07 A01                         A01                         sama
63      (valid)                     (valid)                     BERBEDA (dihitung ulang)
```

Ringkasan komparator: 17 sama, 3 berubah (`01`, `62`, `63`), 2 hanya di S2
(`54`, `62.50`), urutan tag level atas sama. Kedua CRC valid.

### Temuan

- **[SAMPLE]** Kedua payload valid secara struktural (tanpa error parse, CRC valid).
- **[SPEC]** + **[SAMPLE]** Perbedaan statis→dinamis yang didefinisikan EMVCo
  muncul seperti yang diharapkan: tag 01 `11` → `12` dan tag 54 ditambahkan
  (`2000`, bilangan bulat tanpa desimal).
- **[SAMPLE]** Merchant Account Information (26, 51), MCC, nama, kota, kode pos,
  dan 62.07 (Terminal Label `A01`) **identik** antara S1 dan S2. Identitas
  merchant tidak berubah pada QRIS dinamis.
- **[SAMPLE]** S2 memiliki **sub-tag 62.50** yang tidak ada di S1: string 28
  karakter yang **bukan** TLV bersarang. EMVCo mendefinisikan 62.50–99 sebagai
  _Payment System Specific Template_ (seharusnya TLV dengan GUI di sub-tag 00);
  GoPay mengisinya dengan nilai opaque.
- **[SAMPLE] [HYPOTHESIS]** Pola nilai 62.50: `A3` + `YYYYMMDDhhmmss` +
  12 karakter alfanumerik acak. Segmen waktu `20261125020820` = 25 Nov 2026
  02:08:20 **UTC** = 09:08:20 **WIB**, cocok dengan waktu pembuatan QR di
  screenshot (09:08). Hipotesis: ini **referensi transaksi yang dibuat server
  GoPay**, dan kemungkinan menjadi kunci untuk masa berlaku, status sekali
  pakai, dan pembatalan. Arti prefiks `A3` tidak diketahui. Baru diamati pada
  1 sampel.
- **[SAMPLE]** 26.00 = `COM.GO-JEK.WWW`; Merchant PAN diawali `93600914`
  (diduga NNS GoPay, **[QRIS-UNVERIFIED]**). Tag 51 adalah repositori nasional
  (`ID.CO.QRIS.WWW`) berisi NMID yang sama dengan yang tampil di aplikasi.
- **[SAMPLE] [HYPOTHESIS]** Merchant ID (26.02) tampak berupa `G` + 9 digit
  terakhir Merchant PAN. Baru 1 sampel; tidak dipakai untuk kesimpulan apa pun.
- **[SAMPLE]** Nama (59) dan kota (60) dipotong tepat di batas EMVCo (25 dan 15
  karakter), sementara aplikasi menampilkan versi lebih panjang.

### Implikasi untuk pertanyaan riset utama (masih hipotesis)

- **[HYPOTHESIS]** Secara struktural, payload S1 bisa diubah lokal menjadi payload
  yang **mirip** S2 (01 → `12`, tambah 54, CRC dihitung ulang). Bedanya, payload
  itu **tidak memiliki 62.50**, karena nilai tersebut dibuat server GoPay dan
  tidak bisa diturunkan dari payload statis.
- **[HYPOTHESIS]** Membuat sendiri nilai 62.50 berarti memalsukan referensi
  transaksi. Ini **di luar batas riset** (SECURITY.md §2) dan tidak akan diuji.
- **[HYPOTHESIS]** Tanpa 62.50, sistem GoPay kemungkinan tidak dapat
  mengaitkan pembayaran dengan tagihan tertentu (tidak ada masa berlaku, status
  sekali pakai, pembatalan, atau rekonsiliasi per tagihan). Apakah pembayaran
  seperti itu tetap diterima sebagai pembayaran ke merchant (diperlakukan seperti
  QRIS statis dengan nominal terisi) **tidak dapat ditentukan dari struktur
  payload** dan memerlukan uji terkontrol (SECURITY.md §5) atau dokumentasi
  resmi.

## 5. Eksperimen konversi statis → dinamis (Fase 4)

`staticToDynamic(S1, { amount: "2000" })` dijalankan secara lokal, lalu hasilnya
(disebut S1') dibandingkan dengan S2, yaitu QR dinamis resmi dari GoPay dengan
nominal yang sama.

|                                       |                                                                     |
| ------------------------------------- | ------------------------------------------------------------------- |
| Perubahan S1 → S1'                    | `01`: `11`→`12`, `54`: (tidak ada)→`2000`, `63`: CRC dihitung ulang |
| Validasi S1'                          | valid secara struktural, tanpa warning                              |
| S1' vs S2                             | 19 sama, 2 berubah (`62`, `63`), 1 hanya di S2 (`62.50`)            |
| Menjalankan `staticToDynamic` pada S2 | ditolak (S2 berisi 62.50 = QR terbitan provider)                    |

### Temuan

- **[SAMPLE]** Payload hasil konversi lokal **identik dengan QRIS dinamis resmi
  GoPay pada semua field, kecuali `62.50`** (dan CRC yang otomatis ikut berbeda).
  Field yang sama mencakup identitas merchant, nominal, POI, MCC, nama, kota,
  kode pos, dan 62.07.
- **[SPEC]** Seluruh perbedaan statis vs dinamis yang didefinisikan EMVCo (01, 54)
  dapat direproduksi secara lokal. CRC tidak menjadi penghalang karena siapa pun
  bisa menghitungnya.
- **[SAMPLE] [HYPOTHESIS]** Satu-satunya pembeda, `62.50`, adalah nilai yang
  dibuat server GoPay saat merchant menekan "Buat tagihan QRIS pakai nominal".
  Nilai ini tidak bisa diturunkan dari payload statis dan tidak diuji untuk
  dibuat sendiri (SECURITY.md §2).

### Jawaban sementara untuk pertanyaan riset utama

> Apakah QRIS statis GoPay bisa ditransformasi lokal menjadi QRIS dinamis yang
> diterima sebagai transaksi terotorisasi?

- **Secara struktur: ya, hampir seluruhnya.** Hasil konversi hanya kurang satu
  field (`62.50`) dibanding QR dinamis resmi.
- **Sebagai "tagihan dinamis GoPay": tidak.** Tanpa `62.50`, server GoPay tidak
  punya referensi tagihan, sehingga tidak ada masa berlaku, status sekali pakai,
  pembatalan, atau pencocokan pembayaran dengan tagihan tertentu.
- **Apakah pembayaran ke payload hasil konversi masuk ke merchant: ya, dalam
  satu uji terkontrol** (lihat §6, T1).

## 6. Uji terkontrol (Fase 5)

Prosedur mengikuti SECURITY.md §5: merchant milik peneliti, akun pembayar milik
peneliti, nominal minimal.

| ID  | Tanggal    | Payload                                                        | Nominal  | Aplikasi pembayar | Hasil                                                        |
| --- | ---------- | -------------------------------------------------------------- | -------- | ----------------- | ------------------------------------------------------------ |
| T1  | 2026-11-25 | `staticToDynamic(S1, 1000)` → `out/test-1000.png` (CRC `D6E1`) | Rp 1.000 | _belum dicatat_   | Saldo pembayar terpotong; dana masuk ke saldo GoPay Merchant |

### Temuan

- **[SAMPLE] (n=1)** Payload hasil konversi lokal (01=`12`, 54=`1000`, CRC
  dihitung ulang, **tanpa 62.50**) dapat dipindai dan dibayar. Saldo pembayar
  terpotong dan dana masuk ke merchant yang sama.
- **[SAMPLE]** Infrastruktur pembayaran **tidak mensyaratkan 62.50** agar
  pembayaran ke QR ber-POI `12` dengan nominal terisi berhasil. Dengan kata
  lain, keberadaan referensi provider tidak dicek untuk pembayaran ini.
- **Interpretasi:** pembayaran ini diselesaikan berdasarkan data rekening
  merchant (26/51) dan nominal (54), yaitu field yang sama dengan QR statis.
  Hasil ini **konsisten dengan hipotesis** bahwa payload hasil konversi
  diperlakukan seperti QR statis dengan nominal yang sudah terisi, bukan sebagai
  tagihan GoPay.

### Yang belum diketahui dari T1

- Aplikasi pembayar yang dipakai, dan apakah nominal Rp 1.000 langsung terisi
  atau harus diketik.
- Bagaimana transaksi tercatat di GoPay Merchant: sebagai tagihan (seperti
  pembayaran S2) atau sebagai pembayaran QR biasa.
- Apakah QR yang sama bisa dibayar **lebih dari sekali**. Hipotesisnya bisa,
  karena tidak ada referensi sekali pakai.
- Apakah perilakunya sama di aplikasi pembayar lain (bank, e-wallet lain).

### Jawaban untuk pertanyaan riset utama (diperbarui)

- **Bisa.** QRIS statis GoPay dapat diubah secara lokal menjadi QR dengan
  nominal terisi (POI `12`) yang **berhasil dibayar** dan dananya masuk ke
  merchant (T1).
- **Tetapi hasilnya tidak setara dengan QRIS dinamis yang diterbitkan GoPay.**
  QR hasil konversi tidak punya referensi tagihan (62.50), sehingga tidak ada
  masa berlaku, status sekali pakai, pembatalan, atau pencocokan otomatis
  dengan tagihan tertentu di sisi GoPay. Fungsinya setara dengan QR statis
  yang nominalnya sudah diisikan.

## 7. Temuan berikutnya

- Lengkapi catatan T1 (aplikasi pembayar, tampilan nominal, kategori transaksi
  di dashboard).
- T2 (opsional): bayar QR yang sama kedua kali untuk menguji ada tidaknya
  batasan sekali pakai.
- T3 (opsional): uji dengan aplikasi pembayar lain.
- Penelusuran dokumentasi resmi GoPay/Midtrans terkait QRIS dinamis
  (pertanyaan riset 9).
