# Pengelolaan FieldOps

Panduan untuk instruktur dan pengembang. Peserta cukup mengikuti [workshop](workshop.md); cara menjalankan aplikasi ada di [README](../README.md).

## Struktur dan batas tanggung jawab

| Lokasi                                      | Isi                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/http/`                        | Routing, SSE, error response dan panduan HTML                          |
| `apps/api/src/infrastructure/`              | Konfigurasi, client Redis/KafkaJS dan observasi stream                 |
| `apps/api/src/operations/`                  | State konsol, contoh wilayah Jakarta Pusat, simulator dan lifecycle    |
| `apps/api/src/workshop/`                    | Kontrak/parser latihan, hints dan validator perilaku                   |
| `apps/api/src/labs/`                        | Empat fungsi peserta; path tetap selama workshop                       |
| `apps/web/src/app/`                         | Navigasi, shell dan koneksi SSE                                        |
| `apps/web/src/features/`                    | Komponen dan CSS per fitur: ringkasan, penugasan, monitoring, workshop |
| `apps/web/src/shared/`, `styles/`           | API client, status aset, komponen bersama, token dan layout            |
| `packages/contracts/`                       | Paket deklarasi tipe API bersama; tanpa client atau rahasia            |
| `infra/docker/`, `infra/compose/`           | Image aplikasi dan override lingkungan                                 |
| `workshop/starters/`, `workshop/solutions/` | Template reset dan jawaban manual                                      |
| `scripts/labs/`, `tests/`                   | Perintah pengelolaan dan pemeriksaan berdasarkan jenis                 |

Runtime API hanya mengimpor `labs/`. Validator memakai fungsi yang sama dengan API, fixture terisolasi, timeout 20 detik per latihan dan cleanup. Producer/consumer uji lengkap hanya berada pada validator atau pengujian. Frontend tidak menghitung hasil radius atau menghasilkan sensor sendiri.

## Persiapan sesi

1. Siapkan endpoint database Redis Enterprise dan akun peserta. Gunakan mode Enterprise; mode lokal tersedia untuk percobaan tanpa endpoint instruktur.
2. Buka ketiga halaman; metadata awal: 7 aset dan 10 teknisi.
3. Mulai dari **Koneksi Redis** di Mode workshop. Periksa starter: koneksi belum diverifikasi, empat latihan belum selesai, marker preview, belum ada event consumer.
4. Uji solusi pada salinan terpisah dengan `test:integration`, lalu bagikan starter.
5. Gunakan satu peserta per instance. Prefix nama lab mencegah benturan, bukan pengganti isolasi akses.

```bash
./scripts/workspace-compose.sh ps
./scripts/workspace-compose.sh logs --tail=80 api korvet
./scripts/workspace-compose.sh exec api npm run typecheck
```

Helper memakai Docker biasa bila tersedia, atau VM Lima lokal yang sudah disiapkan. Jalankan sebagai user macOS pemilik VM; Docker di lingkungan ini berjalan rootless di dalam VM. Pada mesin peserta yang memiliki Docker, seluruh contoh helper dapat diganti `docker compose`.

## Konfigurasi

Rahasia berada pada backend `.env`, tidak menggunakan prefix `VITE_`.

| Variabel                                          | Default / fungsi                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `LAB_ID`                                          | `fieldops-demo`; dasar namespace key/topic/group                      |
| `REDIS_URL`                                       | `redis://redis:6379`; mendukung username/password dan `rediss://`     |
| `REDIS_CA_FILE`                                   | CA PEM untuk TLS; path di container API, misalnya `/app/certs/ca.pem` |
| `REDIS_CLIENT_CERT_FILE`, `REDIS_CLIENT_KEY_FILE` | Sertifikat/key PEM berpasangan untuk mutual TLS                       |
| `REDIS_TLS_SERVERNAME`                            | Opsional hostname verifikasi/SNI jika endpoint memerlukannya          |
| `REDIS_CONNECT_TIMEOUT_MS`                        | Default 5000 ms; 500–15000 ms                                         |
| `KAFKA_BROKERS`                                   | `korvet:9092` pada jaringan Compose                                   |
| `TELEMETRY_TOPIC`                                 | Kosong → `<LAB_ID>-telemetry`                                         |
| `KAFKA_GROUP_ID`                                  | Kosong → `<LAB_ID>-dashboard`                                         |
| `KORVET_NAMESPACE`                                | `korvet`; harus sama dengan service penyimpanan                       |
| `KAFKA_SSL`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`   | Opsi Kafka TLS / SASL PLAIN                                           |
| `WEB_PORT`, `API_PORT`                            | Port host 8088 dan 3001                                               |

Custom topic/group harus diawali `LAB_ID-`. Redis observasi harus menunjuk penyimpanan lokal Korvet yang sama. Redis 8.2.3 menyediakan JSON untuk registry Korvet; Redis 7 biasa tidak mencukupi.

KafkaJS memakai alamat bootstrap lalu alamat pada metadata broker. Default `KORVET_BROKER_ADVERTISED_HOST=korvet` dapat diakses container API.

### Backend di host

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/host.yaml up -d redis korvet
npm ci
REDIS_URL=redis://localhost:6379 KAFKA_BROKERS=localhost:9092 npm run dev
```

Node 22.22.0/npm 10.9.4, UI http://localhost:5173. Override mengiklankan `localhost`; jalankan hanya Redis/Korvet dalam mode ini. Client pada komputer lain membutuhkan hostname/IP advertised yang dapat dijangkau mereka.

### Endpoint instruktur

Isi `.env` dengan endpoint Redis/Korvet, LAB_ID unik, kredensial dan namespace yang benar:

```bash
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/external.yaml up -d --build api web
```

Hanya API/web yang dimulai. Redis observasi harus menunjuk database tempat Korvet instruktur menyimpan Streams. Akun memerlukan izin membuat dan membersihkan fixture milik lab. Endpoint instruktur sebenarnya belum tersedia untuk pengujian; periksa sebelum sesi.

### Redis Enterprise

Default sesi Enterprise menggunakan Redis eksternal dengan Korvet lokal melalui image resmi:

```bash
cp .env.enterprise.example .env
# Isi endpoint database, username/password, serta opsi TLS dari instruktur.
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml up -d --build redis-link korvet api web
./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/enterprise.yaml exec api npm run connection:check
```

Override menghapus ketergantungan Korvet terhadap Redis lokal dan menghapus ketergantungan startup API terhadap kesehatan Korvet. Dengan demikian UI dapat dipakai memperbaiki koneksi saat endpoint salah. API mengakses `REDIS_URL` langsung. Korvet resmi meneruskan protokol Redis melalui `redis-link` pada jaringan Compose menuju endpoint yang sama; kredensial dan database URI dipertahankan. Tidak ada fallback ke database lokal. Setelah `.env` berubah, jalankan `up -d redis-link korvet api web` dengan override yang sama agar container direcreate bila konfigurasi berubah.

Gunakan endpoint database yang menerima protokol Redis melalui proxy Enterprise. Port mengikuti database, bukan port console/API administrasi. Database perlu mendukung GEO, Streams, dan JSON untuk registry Korvet. Tahap persiapan memeriksa PING/SET/GET/DEL pada `fieldops:<LAB_ID>:check:*`; latihan kemudian memeriksa command GEO/Kafka/storage yang sebenarnya. Akun peserta dan Korvet juga perlu izin command/key metadata, GEO, hash posisi, SCAN/TYPE/Streams, dan JSON sesuai namespace lab. Prefix nama bukan isolasi akses.

**TLS API:** letakkan CA PEM di `infra/certificates/ca.pem`, lalu isi `REDIS_CA_FILE=/app/certs/ca.pem`. Untuk mutual TLS, tambahkan client certificate/key PEM dan path `/app/certs/client.crt`, `/app/certs/client.key` pada variabel terkait. Verifikasi sertifikat selalu aktif. CA/key yang salah atau tidak terbaca menghasilkan pesan persiapan, tanpa membuka fitur. Folder sertifikat dimount read-only dan dikecualikan dari Git/image.

Jika isi sertifikat diganti pada path yang sama, gunakan `up -d --force-recreate redis-link korvet api web` dengan override Enterprise agar client memuat file baru. Mengubah isi file saja tidak mengubah konfigurasi Compose.

**TLS Korvet lokal:** service `redis-link` meneruskan byte Redis ke endpoint instruktur menggunakan Node TLS. API dan penghubung membaca CA/cert/key PEM yang sama; peserta tidak perlu membuat trust store Java. Koneksi Korvet ke penghubung berada pada jaringan Compose, tanpa port penghubung dipublikasikan ke host. Penghubung memverifikasi sertifikat server, mendukung mutual TLS, dan tidak membaca/menulis command Redis sendiri. Jika URI memakai `redis://`, transport mengikuti endpoint tanpa TLS.

Pengujian image Korvet v0.19.0 menunjukkan opsi Java key store tidak mengirim sertifikat client pada koneksi Redis. Penghubung disediakan agar mode Enterprise tetap dapat digunakan pada database yang mewajibkan mutual TLS. Image Korvet dan protokol Kafka tetap memakai distribusi resmi; penghubung hanya mengurus transport Redis. Jika Korvet telah disiapkan instruktur, mode endpoint instruktur cukup menjalankan API/web dan tidak memakai penghubung lokal.

## Jawaban dan reset

```bash
./scripts/workspace-compose.sh exec api npm run solution:apply -- geo
./scripts/workspace-compose.sh exec api npm run solution:apply -- korvet
# Atau kedua modul:
./scripts/workspace-compose.sh exec api npm run solution:apply -- all
```

Source jawaban: [geo.solution.ts](../workshop/solutions/geo.solution.ts) dan [korvet.solution.ts](../workshop/solutions/korvet.solution.ts). Keduanya menggunakan signature/import yang sesuai starter. Setiap overwrite membuat backup bertanggal di `.workshop-backups/`. Setelah watcher restart, periksa latihan kembali.

| Latihan   | Alasan operasi / kesalahan umum                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| GEO-01    | GEOADD memperbarui member yang sama. Gunakan parameter key/ID/koordinat; periksa urutan longitude–latitude |
| GEO-02    | Redis melakukan radius dan ASC. Unit km, WITHDIST/WITHCOORD serta parsing reply diperlukan                 |
| KORVET-01 | Key=assetId, value=JSON string. Ack hanya membuktikan pengiriman; jangan memakai topic/event tetap         |
| KORVET-02 | Subscribe lalu run; callback dari eachMessage. Parse payload invalid, jangan membuat consumer baru         |

Reset **kode** ke empat stub:

```bash
./scripts/workspace-compose.sh exec api npm run lab:reset -- all
```

Reset **data** milik lab (sesuaikan konfirmasi LAB_ID):

```bash
./scripts/workspace-compose.sh exec api npm run data:reset -- --confirm=fieldops-demo
```

Backend menghentikan simulator/consumer sebelum membersihkan key/topic/group lab. Tidak ada penghapusan seluruh database. Reset volume hanya untuk instance lokal khusus lab, dengan `down --volumes`.

## Pengembangan dan pemeriksaan

```bash
npm ci
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:connection
npx playwright install chromium
LAB_ID=fieldops-test ./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/test.yaml up -d redis korvet
REDIS_URL=redis://localhost:16379 KAFKA_BROKERS=localhost:19092 npm run test:integration
npm run test:outages
WEB_URL=http://localhost:8088 npm run test:browser
./scripts/workspace-compose.sh exec api npm run test:watcher
LAB_ID=fieldops-test ./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/test.yaml down
```

Unit test memeriksa template starter dalam salinan terpisah, parsing dan state; edit peserta tidak ditimpa. Integrasi menggunakan salinan solusi sementara dengan LAB_ID unik. Uji gangguan hanya menghentikan instance `fieldops-test` pada port 16379/19092. Screenshot hasil uji berada di `test-results/screenshots/`; `docs/assets/` memuat pilihan screenshot aktual untuk panduan.

Pemeriksaan peserta: `exec api npm run connection:check` terlebih dahulu, lalu `exec api npm run lab:validate`. Gunakan file Compose/override yang sama dengan startup. Setelah watcher/restart backend, koneksi kembali memerlukan pemeriksaan. Exit code 1 pada starter adalah hasil yang diharapkan untuk empat fungsi yang belum diisi.

### Catatan verifikasi

Pengujian awal 6 Oktober 2026 menggunakan Redis 8.2.3, Korvet v0.19.0 dan Linux ARM64 tanpa emulasi. Setelah perapian 7 Oktober, struktur baru diperiksa ulang melalui build/typecheck, unit, integrasi solusi, watcher dan browser pada 1440×900/1366×768 serta 768×1024. Kasus yang diperiksa: radius kosong, koordinat buruk, perpindahan teknisi, ketiga skenario simulator, threshold, eventId/storage, deduplikasi, restart, kegagalan implementasi dan gangguan layanan.

Pembaruan peta pada 7 Oktober diuji ulang melalui build/typecheck, unit starter, integrasi solusi dan browser pada tiga ukuran tersebut. Tile OpenStreetMap nyata berhasil dimuat. Radius 1 km dari Gambir menghasilkan dua teknisi dan 3 km menghasilkan enam; perpindahan posisi mengubah hasil. Tile yang sengaja diputus beralih ke grid berlabel, lalu **Muat ulang peta** memulihkan basemap. Klik titik, marker, tombol area, dan attribution turut diperiksa. Screenshot di `docs/assets/` diambil dari aplikasi yang berjalan setelah review visual.

Peta menggunakan tile OpenStreetMap sebagai tampilan awal; zoom dan klik titik bekerja pada koordinat geografis Indonesia. Dataset awal berada di `apps/api/src/operations/fixtures.ts`; sumber 17 wilayah dan koordinatnya dicatat di [data lokasi](assets/jakarta-locations.json). Wilayah teknisi adalah area tugas awal; form memperbarui koordinat tanpa melakukan reverse geocoding. Posisi yang sudah disimpan peserta tetap dipakai. Jika ingin seluruh posisi kembali ke dataset awal, gunakan reset data lab sesuai prosedur di atas.

Pembaruan 12 Oktober menambahkan persiapan koneksi sebelum empat latihan. Build/typecheck, lima unit test, browser pada tiga ukuran, watcher dan gangguan layanan diperiksa ulang. `test:connection` menjalankan Redis 8.2.3 dengan password, CA privat dan mutual TLS, serta Korvet resmi melalui penghubung. URL salah, password salah, CA tidak dipercaya, client certificate tidak ada, akun PING tanpa SET, dan port tidak tersedia tetap mengunci fitur. Solusi lengkap lulus pada koneksi TLS tersebut, termasuk storage/consumer, radius, alarm, deduplikasi dan restart. Transport tanpa TLS juga diperiksa dengan nilai yang dicocokkan langsung pada database tujuan.

Runtime AMD64/emulasi, endpoint Redis Enterprise instruktur yang sebenarnya, serta Kafka TLS/SASL eksternal belum diuji. Endpoint instruktur belum disediakan; hasil TLS/mutual TLS di atas menggunakan instance Redis asli yang khusus uji, bukan klaim pengujian produk Enterprise pada endpoint tersebut. Manifest image menyediakan ARM64 dan AMD64. Rincian release, commit dan keterbatasan format storage ada di [referensi](references.md).

## Troubleshooting

| Gejala                             | Pemeriksaan                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `docker: command not found`        | Jalankan helper sebagai user biasa; Docker di workspace ini berada dalam VM                       |
| Perubahan belum tampil             | Labs: tunggu watcher lalu validasi. Frontend: `up -d --build`, refresh browser                    |
| Bootstrap berhasil lalu timeout    | Cocokkan advertised host/port dengan jaringan client                                              |
| Korvet gagal JSON.SET              | Pastikan Redis menyediakan JSON                                                                   |
| Send berhasil, grafik kosong       | Periksa KORVET-02 dan consumer; ack producer tidak mengisi grafik                                 |
| Storage kosong                     | Cocokkan Redis, namespace, topic, partition, dan compression none                                 |
| Replay event                       | Group/offset dapat membaca ulang; eventId dideduplikasi dalam sesi                                |
| API tetap hidup saat layanan putus | Pulihkan layanan, periksa status infrastruktur, lalu validasi kembali                             |
| Tile peta gagal                    | Grid koordinat dan marker tetap dapat digunakan; tekan **Muat ulang peta** setelah internet pulih |
