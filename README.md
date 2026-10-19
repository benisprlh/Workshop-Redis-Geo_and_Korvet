# FieldOps

Panduan dry run workshop Redis untuk penugasan teknisi dan monitoring sensor aset. Jalankan langkah secara berurutan dari kondisi starter hingga empat latihan lulus. Alokasi waktu: 60–90 menit.

| Akses              | Alamat                           | Kegunaan                                                 |
| ------------------ | -------------------------------- | -------------------------------------------------------- |
| FieldOps           | **https://localhost:8443**       | Peta teknisi, simulator, grafik, dan pemeriksaan latihan |
| UI Redis           | **https://redisdc.vtidemo.id**   | Mengakses console database workshop                      |
| Panduan di browser | https://localhost:8443/api/guide | Membaca README ini dan menyalin blok kode                |

Aset, teknisi, posisi operasional, dan nilai sensor merupakan data simulasi. Peta menggunakan wilayah nyata di Jakarta Pusat. Seluruh perintah terminal dijalankan dari folder `Workshop-Redis-Geo_and_Korvet`.

## Persiapan

Siapkan Docker dengan Compose ≥2.24.4, browser, editor kode, dan akun database workshop dari instruktur. Database tujuan perlu mendukung GEO, Streams, dan JSON; Korvet memakai JSON untuk metadata topic.

Perintah menggunakan `./scripts/workspace-compose.sh`. Helper menjalankan Docker Compose pada Docker Desktop atau runtime workspace yang sudah tersedia. Gunakan terminal user biasa. Node.js pada host tidak diperlukan untuk mengikuti dry run; backend berjalan di container.

Alur sesi:

1. Jalankan aplikasi dan periksa kondisi awal.
2. Ganti koneksi Redis lokal ke database workshop.
3. Jalankan Korvet terhadap database yang sama.
4. Kerjakan [GEO-01](#geo-01) dan [GEO-02](#geo-02).
5. Kerjakan [KORVET-01](#korvet-01) dan [KORVET-02](#korvet-02).
6. Cocokkan hasil pada FieldOps dan UI Redis.

## 1. Menjalankan aplikasi

Siapkan konfigurasi awal:

```bash
./scripts/workspace-compose.sh version
test -f .env || cp .env.example .env
```

Perintah pertama memeriksa Compose; baris kedua menyiapkan `.env` jika belum tersedia. Pastikan `.env` menggunakan `WEB_PORT=8443`. Jika instruktur memberikan `LAB_ID` khusus peserta, isi sebelum startup pertama dan pertahankan sepanjang sesi. Compose, key, topic, dan consumer group menggunakan ID tersebut.

Jalankan layanan:

```bash
./scripts/workspace-compose.sh up -d --build
./scripts/workspace-compose.sh ps -a
```

`up` membangun aplikasi, menjalankan Redis lokal, dan menyiapkan sertifikat HTTPS. Service `certificates` selesai dengan status `Exited (0)`; API dan web tetap berjalan.

Buka **https://localhost:8443**. Sertifikat `localhost` dibuat otomatis dan disimpan dalam volume `web-tls`. Pada akses pertama, browser dapat menampilkan pemberitahuan sertifikat lokal. Pilih **Lanjutan / Advanced**, lalu lanjutkan ke `localhost` untuk sesi ini. Sertifikat tersebut hanya dipakai FieldOps lokal; konfigurasi TLS Redis mengikuti database instruktur.

Buka **Mode workshop → Koneksi Redis**, lalu tekan **Periksa koneksi Redis**. Kondisi awal yang diharapkan:

- Endpoint `redis:6379`, yaitu Redis lokal pada jaringan Compose.
- PING, baca/tulis, dan cleanup berhasil.
- Status tetap **Lokal · terkunci**, dengan 0 dari 4 latihan selesai.
- Simulator belum dapat dimulai dan grafik belum berisi event.

Koneksi lokal sengaja tidak membuka latihan. Aturan ini juga berlaku untuk `localhost`, loopback IPv4/IPv6, alias atau IP container Redis bawaan, dan DNS yang mengarah ke loopback.

## Koneksi Redis

**Tahap 2 · 10–15 menit.** Tujuan tahap ini adalah menghubungkan backend ke database workshop yang akan menyimpan lokasi teknisi dan telemetry Korvet.

1. Buka **https://redisdc.vtidemo.id** menggunakan akun dari instruktur.
2. Pilih database yang digunakan untuk workshop. Catat hostname, port database, username, password, dan ketentuan TLS. Minta parameter tersebut kepada instruktur jika tidak ditampilkan di UI.
3. Buka `.env` pada root repository. Ganti `REDIS_URL` sesuai database tersebut.

Format konfigurasi untuk database dengan TLS:

```dotenv
REDIS_URL='rediss://USERNAME:PASSWORD@HOST_DATABASE:PORT'
REDIS_CA_FILE=
REDIS_CLIENT_CERT_FILE=
REDIS_CLIENT_KEY_FILE=
REDIS_TLS_SERVERNAME=
REDIS_CONNECT_TIMEOUT_MS=5000
```

Ganti `USERNAME`, `PASSWORD`, `HOST_DATABASE`, dan `PORT` dengan nilai database. URL `https://redisdc.vtidemo.id` digunakan untuk akses browser; `REDIS_URL` memerlukan endpoint protokol Redis. Gunakan `redis://` jika instruktur menetapkan koneksi tanpa TLS. Karakter khusus pada username/password harus di-encode, misalnya `@` menjadi `%40`.

Jika database menggunakan CA privat, simpan file instruktur di `infra/certificates/`, lalu sesuaikan:

```dotenv
REDIS_CA_FILE=/app/certs/ca.pem
```

Untuk mutual TLS, isi kedua path berikut juga:

```dotenv
REDIS_CLIENT_CERT_FILE=/app/certs/client.crt
REDIS_CLIENT_KEY_FILE=/app/certs/client.key
```

Folder tersebut dimount read-only ke backend dan penghubung Korvet. Rahasia tidak dikirim ke browser. Kosongkan opsi sertifikat yang tidak dibutuhkan database.

Terapkan `.env` yang baru dan periksa koneksi:

```bash
./scripts/workspace-compose.sh up -d api
./scripts/workspace-compose.sh exec -T api npm run connection:check
```

`up -d api` memperbarui environment container. Menyimpan `.env` saja belum mengubah environment backend yang berjalan. Pemeriksaan kemudian membuka koneksi, menjalankan PING, menulis/membaca dua nilai berbeda, dan membersihkan key sementara `fieldops:<LAB_ID>:check:*`.

**Hasil yang diharapkan:** `Koneksi Redis: passed` dan badge **Terverifikasi** pada Mode workshop. PING saja belum cukup; endpoint nonlokal, autentikasi, TLS, baca/tulis, dan cleanup harus berhasil. Endpoint Redis Enterprise dengan IP privat tetap diperbolehkan.

Hentikan placeholder Redis lokal setelah database workshop terverifikasi:

```bash
./scripts/workspace-compose.sh stop redis
```

Volume lokal tetap tersimpan. Tahap berikutnya menggunakan database yang baru dikonfigurasi.

## 3. Menjalankan Korvet

Korvet menyediakan antarmuka kompatibel Kafka dan menyimpan record pada Redis Streams. Aplikasi menggunakan KafkaJS untuk berkomunikasi dengan image Korvet resmi.

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml --profile streaming up -d --build --wait redis-link korvet api web
./scripts/workspace-compose.sh ps -a
```

`redis-link` meneruskan transport Redis, termasuk TLS/mutual TLS, ke endpoint yang sama dengan API. Korvet tetap menjalankan protokol Kafka dan penyimpanan Streams. Profil Enterprise mengecualikan Redis lokal dari startup.

Di **Mode workshop → Infrastruktur lab**, tunggu indikator producer tersambung. Jika API ikut dimulai ulang, tekan **Periksa koneksi Redis** kembali. Topic telemetry memakai satu partition dan nama default `<LAB_ID>-telemetry`; consumer dashboard memakai group `<LAB_ID>-dashboard`.

Topic mengelompokkan event telemetry. Partition menjaga urutan record dalam saluran tersebut; satu partition cukup untuk praktikum ini. Consumer group menyimpan posisi baca agar backend dapat melanjutkan konsumsi.

Jika Korvet sudah disediakan instruktur, isi `KAFKA_BROKERS` pada `.env` dengan endpoint tersebut. Sesuaikan `KAFKA_SSL`, `KAFKA_USERNAME`, dan `KAFKA_PASSWORD` jika diwajibkan instruktur, lalu jalankan API/web saja:

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/external.yaml up -d --build api web
```

Redis pada `.env` harus menunjuk database tempat Korvet instruktur menyimpan Streams. Untuk Korvet lokal dalam Compose, pertahankan `KAFKA_BROKERS=korvet:9092`; alamat advertised broker tersebut dapat dijangkau container API.

## GEO-01

**Tahap 4 · Menyimpan posisi teknisi · 10 menit.**

Buka `apps/api/src/labs/geo.ts`. Pada fungsi `saveTechnicianPosition`, ganti baris `throw new WorkshopTodoError('GEO-01');` dengan:

```ts
await redis.geoAdd(key, {
  longitude: position.longitude,
  latitude: position.latitude,
  member: technicianId,
});
```

Fungsi menerima client Redis, key index lokasi, ID teknisi, dan koordinat. `GEOADD` menambahkan member atau memperbarui posisi ID yang sama. Urutan koordinat Redis adalah **longitude, lalu latitude**. Metadata aset berada terpisah dari index teknisi.

Simpan file. Tunggu log `FieldOps API pada port 3001` setelah watcher memulai ulang backend, lalu jalankan:

```bash
./scripts/workspace-compose.sh exec -T api npm run connection:check
./scripts/workspace-compose.sh exec -T api npm run lab:validate
```

**Hasil yang diharapkan:** `GEO-01: passed`. Tiga latihan lainnya masih belum diisi. Perintah validasi dapat mengembalikan exit code 1 sampai keempat latihan selesai; baca status setiap ID.

Buka **Penugasan Lapangan**, pilih marker teknisi, dan perhatikan form **Perbarui posisi** yang sudah aktif. Posisi awal disiapkan melalui fungsi yang baru diisi.

## GEO-02

**Tahap 5 · Mencari teknisi dalam radius · 10–15 menit.**

Pada file yang sama, cari fungsi `findNearbyTechnicians`. Ganti `throw new WorkshopTodoError('GEO-02');` dengan:

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

`FROMLONLAT` menentukan pusat gangguan. `BYRADIUS` membatasi pencarian dalam kilometer. `ASC` mengurutkan dari jarak terdekat; `WITHDIST` dan `WITHCOORD` mengembalikan jarak dan posisi. Helper `parseGeoReply` mengubah reply Redis ke bentuk hasil yang digunakan UI.

Simpan file, tunggu API siap setelah watcher restart, lalu periksa kembali:

```bash
./scripts/workspace-compose.sh exec -T api npm run connection:check
./scripts/workspace-compose.sh exec -T api npm run lab:validate
```

**Hasil yang diharapkan:** `GEO-01` dan `GEO-02` berstatus `passed`.

Lakukan percobaan berikut pada **Penugasan Lapangan**:

1. Pilih **Aset A-101 · Gambir**, radius **1 km**, lalu **Cari teknisi terdekat**. Dataset awal menghasilkan T-01 dan T-02, diurutkan menurut jarak.
2. Ubah radius menjadi **3 km** dan cari kembali. Dataset awal menghasilkan enam teknisi.
3. Pilih **T-01**, isi longitude `106.8685256` dan latitude `-6.1812095`, lalu **Perbarui posisi**. Koordinat contoh berada di Cempaka Putih.
4. Ulangi pencarian **1 km** dari Aset A-101. T-01 keluar dari hasil karena posisinya telah berubah di Redis.
5. Kembalikan T-01 ke longitude `106.8164340`, latitude `-6.1750093` agar dataset siap digunakan lagi.

Jumlah di atas mengikuti dataset awal. Posisi yang sebelumnya sudah diubah akan memengaruhi hasil. Jarak yang ditampilkan adalah jarak geografis; garis peta menghubungkan posisi dan tidak menunjukkan rute jalan.

Untuk pemeriksaan langsung, gunakan CLI atau workbench yang disediakan instruktur. Jika fasilitas tersebut tersedia di **UI Redis**, pilih database yang sama sebelum menjalankan command. Ganti `fieldops-demo` jika `LAB_ID` Anda berbeda:

```redis
GEOPOS fieldops:fieldops-demo:technicians:geo T-01
GEOSEARCH fieldops:fieldops-demo:technicians:geo FROMLONLAT 106.8167439 -6.1711625 BYRADIUS 1 km ASC WITHDIST WITHCOORD
```

Command pertama membuktikan posisi tersimpan. Command kedua memakai parameter pencarian yang sama dengan aplikasi.

## KORVET-01

**Tahap 6 · Mengirim telemetry · 10 menit.**

Buka `apps/api/src/labs/korvet.ts`. Pada fungsi `publishTelemetry`, ganti `throw new WorkshopTodoError('KORVET-01');` dengan:

```ts
await producer.send({
  topic,
  messages: [{ key: event.assetId, value: JSON.stringify(event) }],
});
```

Producer menerima topic dan satu event sensor. `assetId` menjadi key record; payload diserialisasi sebagai JSON. KafkaJS mengirim record ke Korvet, kemudian Korvet menyimpannya pada Redis Streams.

Simpan file, tunggu API siap setelah watcher restart, lalu periksa:

```bash
./scripts/workspace-compose.sh exec -T api npm run connection:check
./scripts/workspace-compose.sh exec -T api npm run lab:validate
```

**Hasil yang diharapkan:** `KORVET-01: passed`. Buka **Monitoring Aset**, pilih Aset A-101, pilih skenario **Normal**, lalu **Mulai simulasi**. Tunggu sekitar 5 detik, kemudian **Hentikan simulasi**.

Buka panel **Penyimpanan Redis**. Periksa stream key, XLEN, dan eventId pada entri tersimpan. Grafik masih menunggu consumer karena KORVET-02 belum selesai. Keberhasilan producer membuktikan pengiriman; dashboard menerima event melalui consumer pada tahap berikutnya.

## KORVET-02

**Tahap 7 · Mengonsumsi telemetry · 10 menit.**

Pada file `apps/api/src/labs/korvet.ts`, cari fungsi `consumeTelemetry`. Ganti `throw new WorkshopTodoError('KORVET-02');` dengan:

```ts
await consumer.subscribe({ topic, fromBeginning: true });
await consumer.run({
  eachMessage: async ({ message }) => {
    const event = parseTelemetry(message.value);
    if (event) await onEvent(event);
  },
});
```

`subscribe` memilih topic. `run` memulai konsumsi melalui `eachMessage`. Helper memvalidasi payload, kemudian callback `onEvent` memperbarui state backend dan mengirim pembaruan SSE ke browser. Backend mengelola satu consumer dashboard per instance.

Simpan file, tunggu API siap setelah watcher restart, lalu jalankan pemeriksaan akhir:

```bash
./scripts/workspace-compose.sh exec -T api npm run connection:check
./scripts/workspace-compose.sh exec -T api npm run lab:validate
```

**Hasil yang diharapkan:** keempat ID berstatus `passed`, progress **4 dari 4**, dan indikator consumer aktif. Jika consumer masih bergabung dengan group, tunggu beberapa detik.

Alur data yang digunakan:

```text
Simulator backend → KafkaJS producer → Korvet → Redis Streams
                 → KafkaJS consumer → SSE → dashboard FieldOps
```

## 8. Memeriksa monitoring dan alarm

Pada **Monitoring Aset**, pilih Aset A-101 dan jalankan skenario berikut satu per satu. Hentikan simulator sebelum mengganti skenario.

| Skenario             | Durasi percobaan | Hasil yang diperiksa                                                      |
| -------------------- | ---------------- | ------------------------------------------------------------------------- |
| Normal               | 10 detik         | Temperatur sekitar 64 °C, tegangan sekitar 228 V, event diterima consumer |
| Temperatur meningkat | 15–20 detik      | Temperatur melewati 80 °C dan alarm temperatur muncul                     |
| Tegangan turun       | 10–15 detik      | Tegangan di bawah 210 V dan alarm tegangan muncul                         |

Seluruh nilai dan threshold merupakan simulasi. Grafik hanya menggunakan event yang sudah diterima consumer. Pada perjalanan event, cocokkan status dikirim, tersimpan, dan diterima. Tampilan memakai eventId untuk mengurangi duplikasi jika record terbaca ulang; aplikasi tidak menjanjikan exactly-once delivery.

Pada **Penyimpanan Redis**, salin stream key aktual dan satu eventId. Buka **https://redisdc.vtidemo.id** dan pastikan database yang dipilih sesuai endpoint FieldOps. Jika tersedia browser key atau workbench, gunakan untuk memeriksa stream tersebut. Panel FieldOps juga membaca bukti penyimpanan langsung dari Redis.

Pada konfigurasi Korvet yang dipin, stream pertama biasanya berformat `korvet:storage:local:<LAB_ID>-telemetry:0:0`; gunakan key yang benar-benar ditampilkan panel. Command berikut dapat dijalankan pada CLI/workbench instruktur.

Contoh untuk `LAB_ID=fieldops-demo`:

```redis
XLEN korvet:storage:local:fieldops-demo-telemetry:0:0
XREVRANGE korvet:storage:local:fieldops-demo-telemetry:0:0 + - COUNT 5
XRANGE korvet:storage:local:fieldops-demo-telemetry:0:0 - + COUNT 5
```

`XLEN` menunjukkan panjang stream. `XREVRANGE` mengambil lima entri terbaru; `XRANGE` mengambil lima entri dari awal. Cocokkan eventId pada record terbaru dengan event yang tampil di FieldOps. Panel aplikasi menemukan key aktual dan menampilkan beberapa entri tanpa memerlukan peserta menebak struktur internal Korvet.

## Jawaban, reset, dan akhir sesi

Jika perlu melewati pengisian manual saat demonstrasi, terapkan dua jawaban sekaligus:

```bash
./scripts/workspace-compose.sh exec -T api npm run solution:apply -- all
```

Tunggu log API siap setelah watcher restart, kemudian jalankan:

```bash
./scripts/workspace-compose.sh exec -T api npm run connection:check
./scripts/workspace-compose.sh exec -T api npm run lab:validate
```

Perintah membuat backup edit peserta di `.workshop-backups/` sebelum menimpa file. Gunakan `-- geo` atau `-- korvet` untuk satu modul. Jawaban sumber tersedia di `workshop/solutions/`; aplikasi tidak menerapkannya otomatis.

Untuk mengembalikan **kode** ke starter:

```bash
./scripts/workspace-compose.sh exec -T api npm run lab:reset -- all
```

Untuk mereset **data lab** pada database yang dikonfigurasi:

```bash
./scripts/workspace-compose.sh exec -T api sh -c 'npm run data:reset -- --confirm="$LAB_ID"'
```

Reset data menghentikan simulator dan consumer, lalu membersihkan key, topic, serta group milik LAB_ID tersebut. Reset kode dan reset data adalah tindakan terpisah. Prefix lab mencegah benturan nama; instruktur tetap perlu mengatur akses database peserta.

Akhiri sesi dengan:

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml --profile streaming --profile local down
```

Container dihentikan dan volume tetap disimpan. Untuk sesi berikutnya, jalankan startup sesuai mode yang digunakan dan periksa koneksi kembali.

## Perubahan kode dan penanganan kendala

| Perubahan / gejala                                   | Tindakan                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Dua file latihan diubah                              | Simpan, tunggu watcher, lalu periksa koneksi Redis dan latihan                                                              |
| `.env` diubah                                        | Jalankan `./scripts/workspace-compose.sh up -d api`; gunakan mode Enterprise yang sama jika Korvet ikut dikonfigurasi ulang |
| Frontend atau Dockerfile diubah                      | Jalankan kembali perintah startup dengan `--build`, lalu muat ulang browser                                                 |
| File CA/cert/key diganti pada path yang sama         | Recreate API, redis-link, dan Korvet dengan `--force-recreate` pada mode Enterprise                                         |
| HTTPS localhost menampilkan pemberitahuan sertifikat | Pastikan alamat `https://localhost:8443`, lalu lanjutkan akses sertifikat lokal untuk sesi workshop                         |
| Koneksi masih Lokal · terkunci                       | Ganti REDIS_URL ke endpoint instruktur, terapkan environment container, lalu periksa kembali                                |
| Autentikasi atau TLS Redis gagal                     | Periksa endpoint database, port, kredensial yang di-encode, CA, dan pasangan sertifikat client                              |
| Korvet gagal dengan JSON.SET                         | Pastikan database menyediakan fitur Redis JSON                                                                              |
| Producer tersambung, grafik belum bergerak           | Periksa KORVET-02, consumer, aset yang dipilih, dan simulator                                                               |
| Peta jalan tidak tersedia                            | Gunakan grid koordinat; tombol Muat ulang peta mencoba tile kembali                                                         |
| Reset memberi pesan consumer group masih aktif       | Hentikan consumer lab. Setelah gangguan Redis, instruktur dapat memulai ulang Korvet sebelum mengulangi reset               |

Log aplikasi dan Korvet:

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml logs --tail=80 api redis-link korvet
```

Korvet v0.19.0 pernah mempertahankan membership consumer setelah storage Redis terputus. Pada instance khusus lab, instruktur dapat menjalankan:

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml restart korvet
```

Restart broker yang dipakai bersama dikelola instruktur. Aplikasi memberi HTTP 409 saat reset terhalang membership tersebut dan tidak melaporkan cleanup sebagai berhasil.

## Catatan teknis dan referensi

Peserta hanya mengubah `.env`, `apps/api/src/labs/geo.ts`, dan `apps/api/src/labs/korvet.ts`. UI, client lifecycle, simulator, validasi, dan SSE sudah disiapkan. Pada panduan browser, setiap blok kode memiliki tombol **Salin kode**.

![Mode workshop FieldOps dengan Redis lokal tetap terkunci](apps/web/public/workshop.png)

| Komponen                         | Versi yang dipin                                           |
| -------------------------------- | ---------------------------------------------------------- |
| Node.js / npm                    | 22.22.0 / 10.9.4                                           |
| Redis lokal dan fixture          | 8.2.3-alpine                                               |
| Korvet                           | v0.19.0, image distribusi resmi dengan digest pada Compose |
| KafkaJS / node-redis             | 2.2.4 / 4.7.1                                              |
| React / TypeScript / Vite        | 19.2.0 / 5.9.3 / 7.1.12                                    |
| nginx / OpenSSL sertifikat lokal | 1.28.0-alpine / 3.5.4                                      |

Korvet dipin pada release [v0.19.0](https://github.com/redis-field-engineering/korvet-dist/releases/tag/v0.19.0), commit release `73440c9faf2e1d92652c49dd94a2bb2a2bac7248`. Dokumentasi dan sample distribusi yang dirujuk berasal dari commit `8ef461e8317b2590edfde386ee810154ef7d0971`. Commit build situs dokumentasi tidak dipublikasikan pada halaman yang diperiksa.

- Sumber Korvet: [README](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/README.adoc), [kafka-cli](https://github.com/redis-field-engineering/korvet-dist/tree/8ef461e8317b2590edfde386ee810154ef7d0971/samples/kafka-cli), [pacman](https://github.com/redis-field-engineering/korvet-dist/tree/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman), [konfigurasi 0.19](https://redis-field-engineering.github.io/korvet/0.19/reference/configuration.html), dan [Redis Streams 0.19](https://redis-field-engineering.github.io/korvet/0.19/storage/redis-streams.html).
- Command Redis: [GEOADD](https://redis.io/docs/latest/commands/geoadd/), [GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/), [Streams](https://redis.io/docs/latest/develop/data-types/streams/), [XLEN](https://redis.io/docs/latest/commands/xlen/), dan [XRANGE](https://redis.io/docs/latest/commands/xrange/).
- KafkaJS: [producer](https://kafka.js.org/docs/producing) dan [consumer](https://kafka.js.org/docs/consuming).
- Geografi: [OpenStreetMap](https://www.openstreetmap.org/copyright), [sumber koordinat wilayah](apps/api/src/operations/jakarta-locations.json). Attribution peta dipertahankan.
- [Pemberitahuan lisensi Korvet](licenses/korvet-LICENSE.txt) dipertahankan tanpa perubahan. FieldOps menggunakan distribusi resmi Korvet; tidak mengimplementasikan ulang broker atau seluruh fitur Kafka.

Alur Redis/Korvet telah diperiksa pada Linux ARM64 tanpa emulasi, termasuk TLS/mutual TLS menggunakan database fixture. Manifest Korvet menyediakan AMD64; runtime AMD64 belum diuji. Akses UI Redis dan endpoint database instruktur tetap mengikuti jaringan serta kredensial sesi. Alamat UI Redis yang dicantumkan belum dapat dijangkau dari lingkungan pengujian ini.
