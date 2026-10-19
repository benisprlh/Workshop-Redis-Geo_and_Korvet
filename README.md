# FieldOps — Workshop Redis

Praktikum penugasan teknisi terdekat dengan **Redis Geospatial** dan monitoring sensor dengan **Korvet + Redis Streams**. Aplikasi dan layanan lab sudah disiapkan instruktur. Peserta mengisi empat fungsi pada dua file backend, lalu menguji hasilnya melalui FieldOps. Alokasi waktu: 60–90 menit.

[![Arsitektur FieldOps: web, backend, Korvet, dan Redis Enterprise](apps/web/public/diagrams/workshop-architecture.png)](apps/web/public/diagrams/workshop-architecture.png)

Klik diagram untuk melihat ukuran penuh.

| Akses    | Alamat                              |
| -------- | ----------------------------------- |
| FieldOps | **https://localhost:3000**          |
| UI Redis | **https://redisdc.vtidemo.id:8443** |
| Panduan  | https://localhost:3000/api/guide    |

Peta menggunakan wilayah nyata di Jakarta Pusat. Identitas aset, teknisi, penempatan operasional, serta pembacaan sensor merupakan simulasi untuk latihan.

## Koneksi Redis

Hubungkan FieldOps ke database workshop sebelum mengerjakan GEO-01. Alamat UI Redis digunakan untuk mengelola database; nilai `REDIS_URL` memakai endpoint dan port database yang dipilih.

1. Buka **https://redisdc.vtidemo.id:8443**, lalu **login** menggunakan akun UI Redis dari instruktur.
2. Masuk ke menu **Databases / Database** dan pilih database workshop yang ditentukan instruktur. Database ini juga digunakan Korvet untuk menyimpan telemetry.
3. Buka **Configuration → General**, lalu salin **endpoint database** beserta portnya. Siapkan username dan password database dari instruktur. Jika UI menyediakan connection URI lengkap, salin URI tersebut.
4. Buka file **`.env` pada root repository**. Ganti nilai `REDIS_URL` dengan URI yang disalin. Jika yang tersedia hanya `HOST_DATABASE:PORT_DATABASE`, susun URI dengan format berikut:

```dotenv
REDIS_URL='redis://USERNAME:PASSWORD_DATABASE@HOST_DATABASE:PORT_DATABASE'
```

Ganti seluruh placeholder dengan detail database. Gunakan username `default` jika menggunakan password only. Karakter khusus pada username atau password perlu di-encode untuk URI, misalnya `@` menjadi `%40`. Jika yang disalin berupa perintah `redis-cli -u ...`, ambil URI setelah `-u` untuk nilai `REDIS_URL`.

Untuk database dengan TLS aktif, gunakan skema `rediss://`:

```dotenv
REDIS_URL='rediss://USERNAME:PASSWORD_DATABASE@HOST_DATABASE:PORT_DATABASE'
```

5. Simpan `.env`, lalu buka **https://localhost:3000**. Pilih **Mode workshop → Koneksi Redis** dan tekan **Periksa koneksi Redis**. Tombol ini membaca ulang `.env` dan menerapkan koneksi terbaru. Periksa hostname dan port pada **Endpoint backend**.
6. Lanjutkan ke **GEO-01** ketika status **Terverifikasi** dan pemeriksaan **PING**, **Baca/tulis**, serta **Cleanup** berhasil. Jika muncul **Lokal · terkunci**, periksa `REDIS_URL` yang disimpan. Jika koneksi gagal, cocokkan endpoint, port, kredensial, dan skema `redis://` atau `rediss://` dengan detail database.

Jika endpoint berubah, simulator dan consumer dihentikan, lalu hasil pemeriksaan latihan dikosongkan untuk koneksi baru. Tekan **Periksa latihan** kembali sebelum melanjutkan kedua kasus. Perubahan `.env` diterapkan melalui UI tanpa menjalankan ulang layanan.

Setiap selesai mengedit kode latihan, simpan file dan tunggu backend tersambung kembali. Periksa koneksi Redis jika diminta, kemudian pilih latihan dan tekan **Periksa latihan**. Pemeriksaan memakai Redis dan Korvet yang sebenarnya; fitur terbuka setelah hasilnya **Lulus**.

## Kasus 1 — Menentukan teknisi terdekat

Terjadi gangguan pada **Aset A-101 di Gambir**. Petugas perlu menemukan teknisi dalam radius tertentu, membandingkan jarak dan keterampilan, lalu memilih teknisi. Ketika posisi teknisi berubah, hasil pencarian harus mengikuti posisi terbaru di Redis.

Latihan menggunakan 10 teknisi dan 7 aset di sekitar Jakarta Pusat. Metadata sudah tersedia pada **Penugasan Lapangan**. Marker awal menjadi pratinjau sampai posisi berhasil disimpan melalui fungsi latihan.

File yang dikerjakan: **`apps/api/src/labs/geo.ts`**. Pertahankan import dan signature fungsi yang sudah tersedia.

## GEO-01

**Menyimpan dan memperbarui posisi · 10 menit**

Fungsi `saveTechnicianPosition` menerima client Redis, key index lokasi, ID teknisi, dan koordinat. Hasilnya adalah posisi teknisi yang tersimpan di Redis.

1. Buka `apps/api/src/labs/geo.ts` dan temukan fungsi `saveTechnicianPosition`.
2. Ganti baris `throw new WorkshopTodoError('GEO-01');` dengan kode berikut:

```ts
await redis.geoAdd(key, {
  longitude: position.longitude,
  latitude: position.latitude,
  member: technicianId,
});
```

3. Simpan file, lalu buka **Mode workshop → GEO-01 → Periksa latihan**.
4. Pastikan GEO-01 berstatus **Lulus**. Buka **Penugasan Lapangan** dan pilih marker teknisi; tombol **Perbarui posisi** sudah dapat digunakan.

`GEOADD` menambahkan member baru atau memperbarui posisi member dengan ID yang sama. Urutan koordinat Redis adalah **longitude, lalu latitude**. Index ini berisi teknisi; marker aset disimpan terpisah.

Latihan lain dapat tetap menampilkan **Belum diisi** atau **Dependensi lab belum selesai**. Periksa status GEO-01 untuk tahap ini.

## GEO-02

**Mencari teknisi dalam radius · 10–15 menit**

Fungsi `findNearbyTechnicians` menerima key index teknisi, titik gangguan, dan radius dalam kilometer. Fungsi mengembalikan daftar ID, jarak, dan koordinat dari Redis, diurutkan dari yang terdekat.

1. Pada file yang sama, temukan fungsi `findNearbyTechnicians`.
2. Ganti `throw new WorkshopTodoError('GEO-02');` dengan:

```ts
// prettier-ignore
const reply = await redis.sendCommand([
  'GEOSEARCH', key,
  'FROMLONLAT', String(center.longitude), String(center.latitude),
  'BYRADIUS', String(radiusKm), 'km',
  'ASC', 'WITHDIST', 'WITHCOORD',
]);
return parseGeoReply(reply);
```

3. Simpan, lalu pilih **Mode workshop → GEO-02 → Periksa latihan**.
4. Pastikan GEO-01 dan GEO-02 berstatus **Lulus**. Tombol **Cari teknisi terdekat** pada Penugasan Lapangan sudah aktif.

`FROMLONLAT` menentukan pusat pencarian. `BYRADIUS` membatasi area dalam `km`, sedangkan `ASC` mengurutkan hasil berdasarkan jarak. `WITHDIST` dan `WITHCOORD` menyertakan jarak serta posisi. Helper `parseGeoReply` mengubah reply Redis menjadi data yang digunakan UI.

### Buktikan perubahan hasil pencarian

Lakukan percobaan berikut pada **Penugasan Lapangan**:

| Langkah | Tindakan                                                                                    | Hasil yang diharapkan pada dataset awal          |
| ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1       | Pilih **Aset A-101 · Gambir**, radius **1 km**, lalu **Cari teknisi terdekat**              | T-01 dan T-02, berurutan dari jarak terdekat     |
| 2       | Pilih salah satu hasil                                                                      | Detail teknisi dan garis penghubung tampil       |
| 3       | Ubah radius ke **3 km**, lalu cari kembali                                                  | Enam teknisi ditemukan                           |
| 4       | Pilih T-01, isi longitude `106.8685256` dan latitude `-6.1812095`, lalu **Perbarui posisi** | Posisi T-01 berpindah ke contoh di Cempaka Putih |
| 5       | Cari kembali dari Aset A-101 dengan radius **1 km**                                         | T-01 keluar dari hasil                           |
| 6       | Kembalikan T-01 ke longitude `106.8164340` dan latitude `-6.1750093`                        | Posisi awal pulih untuk percobaan berikutnya     |

Jumlah hasil mengikuti posisi awal. Perubahan posisi sebelumnya akan memengaruhi hasil. Jarak pada aplikasi adalah jarak geografis; garis peta menghubungkan lokasi dan tidak menunjukkan rute jalan atau estimasi waktu tiba.

Coba juga memilih titik pada peta yang jauh dari kumpulan teknisi dengan radius 1 km. Hasil kosong akan menampilkan **Tidak ada teknisi dalam radius**. Perbesar radius untuk membandingkan hasil.

### Periksa posisi langsung di Redis

Buka **https://redisdc.vtidemo.id:8443** dan pilih database lab. Jika tersedia CLI/workbench, jalankan command berikut di sana; jika tidak, gunakan CLI yang disediakan instruktur. Ganti `fieldops-demo` sesuai **Lab ID** yang ditampilkan pada **Mode workshop → Infrastruktur lab**.

```redis
GEOPOS fieldops:fieldops-demo:technicians:geo T-01
GEOSEARCH fieldops:fieldops-demo:technicians:geo FROMLONLAT 106.8167439 -6.1711625 BYRADIUS 1 km ASC WITHDIST WITHCOORD
```

`GEOPOS` memperlihatkan posisi tersimpan. `GEOSEARCH` menggunakan pusat dan radius yang sama dengan percobaan Aset A-101. Cocokkan ID teknisi, urutan, dan jaraknya dengan hasil FieldOps.

## Kasus 2 — Monitoring sensor aset

**Aset A-101** mengirim temperatur, tegangan, dan arus setiap 2,5 detik. Petugas perlu memantau pembacaan terbaru dan menerima alarm ketika temperatur meningkat atau tegangan turun.

Alur yang digunakan dalam latihan:

[![Alur telemetry: producer mengirim ke Korvet, consumer melakukan fetch ke Korvet, dan Korvet mengakses Redis Streams](apps/web/public/diagrams/korvet-telemetry.png)](apps/web/public/diagrams/korvet-telemetry.png)

Korvet menyediakan antarmuka kompatibel Kafka dengan Redis Streams sebagai penyimpanan. **Producer dan consumer KafkaJS sama-sama terhubung ke Korvet** melalui alamat `KAFKA_BROKERS`. Producer mengirim record ke **topic** telemetry; consumer melakukan subscribe dan fetch ke Korvet untuk membaca record. Korvet yang menulis dan membaca Redis Streams. **Consumer group** menyimpan posisi baca. Lab memakai satu topic dengan satu partition, serta satu consumer dashboard per instance backend.

Panel **Penyimpanan Redis** membaca XLEN/XRANGE langsung dari Redis untuk membuktikan penyimpanan. Data grafik diterima melalui consumer KafkaJS yang terhubung ke Korvet.

File yang dikerjakan: **`apps/api/src/labs/korvet.ts`**. Client, topic, parsing event, dan koneksi dashboard sudah disiapkan.

## KORVET-01

**Mengirim event sensor · 10 menit**

Fungsi `publishTelemetry` menerima producer KafkaJS, nama topic, dan satu event sensor. Event memiliki `eventId`, `assetId`, `timestamp`, `temperatureC`, `voltageV`, dan `currentA`.

1. Buka `apps/api/src/labs/korvet.ts` dan temukan fungsi `publishTelemetry`.
2. Ganti `throw new WorkshopTodoError('KORVET-01');` dengan:

```ts
await producer.send({
  topic,
  messages: [{ key: event.assetId, value: JSON.stringify(event) }],
});
```

3. Simpan, lalu pilih **Mode workshop → KORVET-01 → Periksa latihan**. Pastikan status **Lulus**.
4. Buka **Monitoring Aset**, pilih **Aset A-101** dan skenario **Normal**, lalu tekan **Mulai simulasi**.
5. Tunggu sekitar 5 detik, lalu tekan **Hentikan simulasi**. Buka **Penyimpanan Redis** dan tekan **Perbarui**.

`assetId` menjadi key record, sedangkan `JSON.stringify(event)` menyiapkan payload JSON. KafkaJS mengirimnya ke Korvet dan Korvet menyimpan record pada Redis Streams.

**Hasil yang diperiksa:** stream key aktual tampil, XLEN bertambah, dan entri memuat `eventId`. Grafik masih terkunci sampai KORVET-02 lulus. Pengiriman berhasil belum membuktikan event sudah diterima consumer.

## KORVET-02

**Membaca event untuk dashboard · 10 menit**

Fungsi `consumeTelemetry` menerima consumer KafkaJS yang terhubung ke Korvet, topic, dan callback `onEvent`. Callback meneruskan event valid ke state backend dan browser melalui SSE.

1. Pada file yang sama, temukan fungsi `consumeTelemetry`.
2. Ganti `throw new WorkshopTodoError('KORVET-02');` dengan:

```ts
await consumer.subscribe({ topic, fromBeginning: true });
await consumer.run({
  eachMessage: async ({ message }) => {
    const event = parseTelemetry(message.value);
    if (event) await onEvent(event);
  },
});
```

3. Simpan, lalu pilih **Mode workshop → KORVET-02 → Periksa latihan**.
4. Pastikan keempat latihan berstatus **Lulus** dan progress menunjukkan **4 dari 4**. Tunggu beberapa detik sampai indikator **Consumer berjalan** tampil.
5. Buka **Monitoring Aset**, pilih Aset A-101, lalu jalankan skenario **Normal** selama 10 detik.

`subscribe` menentukan topic yang dibaca. `run` memulai konsumsi dan memanggil `eachMessage` untuk setiap record. `parseTelemetry` memvalidasi payload sebelum diteruskan ke `onEvent`. `fromBeginning: true` berlaku saat group belum memiliki offset tersimpan; consumer melanjutkan dari offset group yang sudah ada.

**Hasil yang diperiksa:** jumlah event diterima bertambah, grafik temperatur dan tegangan terisi, serta baris **Event terbaru** muncul. Pilih satu baris untuk memeriksa **Perjalanan event**: **Dikirim → Tersimpan → Diterima consumer**.

### Uji skenario dan alarm

Pada **Monitoring Aset**, jalankan skenario berikut satu per satu. Tekan **Hentikan simulasi** sebelum mengganti skenario.

| Skenario             | Durasi percobaan | Hasil yang diperiksa                                |
| -------------------- | ---------------- | --------------------------------------------------- |
| Normal               | 10 detik         | Temperatur sekitar 64 °C dan tegangan sekitar 228 V |
| Temperatur meningkat | 15–20 detik      | Temperatur melewati 80 °C; alarm temperatur muncul  |
| Tegangan turun       | 10–15 detik      | Tegangan di bawah 210 V; alarm tegangan muncul      |

Semua pembacaan dan threshold merupakan simulasi. Grafik hanya memakai event yang telah dikonsumsi. Tampilan menggunakan `eventId` untuk mengurangi duplikasi ketika record terbaca ulang; alur ini tidak menjanjikan exactly-once delivery.

### Cocokkan event dengan Redis Streams

1. Hentikan simulator agar pembacaan mudah dibandingkan.
2. Pada **Event terbaru**, pilih satu event dan catat `eventId` lengkap dari tooltip ID.
3. Buka **Penyimpanan Redis**, tekan **Perbarui**, lalu cari `eventId` yang sama. Buka detail entri untuk membandingkan `assetId`, temperatur, tegangan, dan timestamp.
4. Untuk pemeriksaan di luar aplikasi, gunakan CLI/workbench pada database lab. Salin **stream key aktual** dari panel. Contoh berikut berlaku jika key yang tampil persis `korvet:storage:local:fieldops-demo-telemetry:0:0`:

```redis
XLEN korvet:storage:local:fieldops-demo-telemetry:0:0
XREVRANGE korvet:storage:local:fieldops-demo-telemetry:0:0 + - COUNT 5
XRANGE korvet:storage:local:fieldops-demo-telemetry:0:0 - + COUNT 5
```

`XLEN` menghitung entri. `XREVRANGE` memperlihatkan lima entri terbaru, sedangkan `XRANGE` memperlihatkan lima entri dari awal stream. Jika key pada panel berbeda, gunakan key tersebut pada ketiga command. Cocokkan `eventId` pada payload dengan event FieldOps.

## Pemeriksaan akhir

Sesi selesai ketika peserta dapat menunjukkan:

- Posisi teknisi tersimpan dan perubahan posisi mengubah hasil pencarian radius.
- Hasil pencarian berasal dari Redis dan berurutan menurut jarak.
- Event dari producer tersimpan di Redis Streams dengan `eventId` yang dapat dicocokkan.
- Consumer memperbarui grafik, tabel event, dan alarm sesuai skenario.
- Empat latihan berstatus **Lulus** pada Mode workshop.

Jika hasil belum sesuai, buka latihan terkait pada **Mode workshop**. **Petunjuk 1** menjelaskan konsep, **Petunjuk 2** menjelaskan API dan parameter, dan **Petunjuk 3** memberikan pseudocode parsial. Pesan hasil pemeriksaan menunjukkan apakah kode perlu diperbaiki, latihan lain belum selesai, atau koneksi infrastruktur bermasalah.

Jawaban lengkap tersedia pada `workshop/solutions/geo.solution.ts` dan `workshop/solutions/korvet.solution.ts`. Gunakan sebagai pembanding atau salin isi fungsi yang diperlukan ke file latihan, simpan, lalu ulangi **Periksa latihan**.

![Panel Mode workshop FieldOps untuk memeriksa koneksi dan latihan](apps/web/public/workshop.png)

## Referensi

- Redis: [koneksi database Enterprise](https://redis.io/docs/latest/operate/rs/databases/connect/), [GEOADD](https://redis.io/docs/latest/commands/geoadd/), [GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/), [Streams](https://redis.io/docs/latest/develop/data-types/streams/), [XLEN](https://redis.io/docs/latest/commands/xlen/), dan [XRANGE](https://redis.io/docs/latest/commands/xrange/).
- KafkaJS 2.2.4: [producer](https://kafka.js.org/docs/producing) dan [consumer](https://kafka.js.org/docs/consuming).
- Korvet: [release v0.19.0](https://github.com/redis-field-engineering/korvet-dist/releases/tag/v0.19.0), [README distribusi](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/README.adoc), [contoh kafka-cli](https://github.com/redis-field-engineering/korvet-dist/tree/8ef461e8317b2590edfde386ee810154ef7d0971/samples/kafka-cli), [contoh pacman](https://github.com/redis-field-engineering/korvet-dist/tree/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman), [konfigurasi](https://redis-field-engineering.github.io/korvet/0.19/reference/configuration.html), dan [penyimpanan Streams](https://redis-field-engineering.github.io/korvet/0.19/storage/redis-streams.html).
- Peta: [OpenStreetMap](https://www.openstreetmap.org/copyright) dan [sumber koordinat wilayah](apps/api/src/operations/jakarta-locations.json).
- [Pemberitahuan lisensi Korvet](licenses/korvet-LICENSE.txt).

Referensi Korvet menggunakan release commit `73440c9faf2e1d92652c49dd94a2bb2a2bac7248` dan commit dokumentasi/sample `8ef461e8317b2590edfde386ee810154ef7d0971`. Situs dokumentasi tidak mencantumkan commit publikasinya. Integrasi diperiksa dengan Korvet v0.19.0 dan KafkaJS 2.2.4 pada Linux ARM64 tanpa emulasi; runtime AMD64 belum diuji. FieldOps menggunakan distribusi resmi Korvet.
