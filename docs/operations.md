# Pengelolaan FieldOps

Panduan untuk instruktur dan pengembang. Peserta cukup mengikuti [workshop](workshop.md); cara menjalankan aplikasi ada di [README](../README.md).

## Struktur dan batas tanggung jawab

| Lokasi                                      | Isi                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/http/`                        | Routing, SSE, error response dan panduan HTML                          |
| `apps/api/src/infrastructure/`              | Konfigurasi, client Redis/KafkaJS dan observasi stream                 |
| `apps/api/src/operations/`                  | State konsol, metadata simulasi, simulator dan lifecycle               |
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

1. Jalankan Compose dan pastikan `redis`, `korvet`, `api` healthy.
2. Buka ketiga halaman; metadata awal: 7 aset dan 10 teknisi.
3. Periksa starter: empat latihan belum selesai, marker preview, belum ada event consumer.
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

| Variabel                                        | Default / fungsi                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `LAB_ID`                                        | `fieldops-demo`; dasar namespace key/topic/group                  |
| `REDIS_URL`                                     | `redis://redis:6379`; mendukung username/password dan `rediss://` |
| `KAFKA_BROKERS`                                 | `korvet:9092` pada jaringan Compose                               |
| `TELEMETRY_TOPIC`                               | Kosong → `<LAB_ID>-telemetry`                                     |
| `KAFKA_GROUP_ID`                                | Kosong → `<LAB_ID>-dashboard`                                     |
| `KORVET_NAMESPACE`                              | `korvet`; harus sama dengan service penyimpanan                   |
| `KAFKA_SSL`, `KAFKA_USERNAME`, `KAFKA_PASSWORD` | Opsi Kafka TLS / SASL PLAIN                                       |
| `WEB_PORT`, `API_PORT`                          | Port host 8088 dan 3001                                           |

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

Hanya API/web yang dimulai. Akun memerlukan izin membuat dan membersihkan fixture milik lab. Koneksi eksternal TLS/SASL belum diuji pada endpoint instruktur; uji sebelum sesi.

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
npx playwright install chromium
LAB_ID=fieldops-test ./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/test.yaml up -d redis korvet
REDIS_URL=redis://localhost:16379 KAFKA_BROKERS=localhost:19092 npm run test:integration
npm run test:outages
WEB_URL=http://localhost:8088 npm run test:browser
./scripts/workspace-compose.sh exec api npm run test:watcher
LAB_ID=fieldops-test ./scripts/workspace-compose.sh -f compose.yaml -f infra/compose/test.yaml down
```

Unit test memeriksa template starter dalam salinan terpisah, parsing dan state; edit peserta tidak ditimpa. Integrasi menggunakan salinan solusi sementara dengan LAB_ID unik. Uji gangguan hanya menghentikan instance `fieldops-test` pada port 16379/19092. Screenshot hasil uji berada di `test-results/screenshots/`; `docs/assets/` memuat pilihan screenshot aktual untuk panduan.

Pemeriksaan peserta melalui UI atau `exec api npm run lab:validate`. Exit code 1 pada starter adalah hasil yang diharapkan.

### Catatan verifikasi

Pengujian awal 6 Oktober 2026 menggunakan Redis 8.2.3, Korvet v0.19.0 dan Linux ARM64 tanpa emulasi. Setelah perapian 7 Oktober, struktur baru diperiksa ulang melalui build/typecheck, unit, integrasi solusi, watcher dan browser pada 1440×900/1366×768 serta 768×1024. Kasus yang diperiksa: radius kosong, koordinat buruk, perpindahan teknisi, ketiga skenario simulator, threshold, eventId/storage, deduplikasi, restart, kegagalan implementasi dan gangguan layanan.

Runtime AMD64/emulasi serta endpoint eksternal TLS/SASL belum diuji. Manifest image menyediakan ARM64 dan AMD64. Rincian release, commit dan keterbatasan format storage ada di [referensi](references.md).

## Troubleshooting

| Gejala                             | Pemeriksaan                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `docker: command not found`        | Jalankan helper sebagai user biasa; Docker di workspace ini berada dalam VM    |
| Perubahan belum tampil             | Labs: tunggu watcher lalu validasi. Frontend: `up -d --build`, refresh browser |
| Bootstrap berhasil lalu timeout    | Cocokkan advertised host/port dengan jaringan client                           |
| Korvet gagal JSON.SET              | Pastikan Redis menyediakan JSON                                                |
| Send berhasil, grafik kosong       | Periksa KORVET-02 dan consumer; ack producer tidak mengisi grafik              |
| Storage kosong                     | Cocokkan Redis, namespace, topic, partition, dan compression none              |
| Replay event                       | Group/offset dapat membaca ulang; eventId dideduplikasi dalam sesi             |
| API tetap hidup saat layanan putus | Pulihkan layanan, periksa status infrastruktur, lalu validasi kembali          |
| Tile peta gagal                    | Skema lokal tetap dapat digunakan                                              |
