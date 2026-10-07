# Referensi, versi, dan verifikasi

Referensi dibaca pada **6 Oktober 2026**. Link menunjuk sumber resmi. Data serta identitas operasional dalam FieldOps dibuat untuk simulasi dan tidak berasal dari sumber organisasi pelanggan.

## Snapshot distribusi Korvet

- Repository resmi: [redis-field-engineering/korvet-dist](https://github.com/redis-field-engineering/korvet-dist).
- Commit dokumentasi dan contoh yang dibaca: [`8ef461e8317b2590edfde386ee810154ef7d0971`](https://github.com/redis-field-engineering/korvet-dist/commit/8ef461e8317b2590edfde386ee810154ef7d0971), bertanggal 16 Juli 2026.
- Release yang dipakai konfigurasi lab: [Korvet v0.19.0](https://github.com/redis-field-engineering/korvet-dist/releases/tag/v0.19.0), dipublikasikan 1 Juli 2026. Tag release menunjuk commit [`73440c9faf2e1d92652c49dd94a2bb2a2bac7248`](https://github.com/redis-field-engineering/korvet-dist/commit/73440c9faf2e1d92652c49dd94a2bb2a2bac7248).
- Image resmi yang diuji dan dipin: `redisfield/korvet:v0.19.0@sha256:c5e2a419ddb1dcb4404b20e7230ecd4804cfdbbff71fafe151c043842389015a`. Sample menulis tag tanpa awalan v; tag itu mengembalikan 404. Registry resmi menyediakan tag dengan awalan v. Tidak ada tag mengambang dalam konfigurasi akhir.
- Release juga menyediakan distribusi biner [`korvet-0.19.0.tar`](https://github.com/redis-field-engineering/korvet-dist/releases/download/v0.19.0/korvet-0.19.0.tar), [`korvet-0.19.0.zip`](https://github.com/redis-field-engineering/korvet-dist/releases/download/v0.19.0/korvet-0.19.0.zip), dan [checksums SHA-256](https://github.com/redis-field-engineering/korvet-dist/releases/download/v0.19.0/checksums_sha256.txt). Ini distribusi resmi, bukan source inti Korvet.

Root README serta sample dibaca pada snapshot dokumentasi di atas, bukan diasumsikan identik dengan tag release. Snapshot yang lebih baru masih memasang image 0.19.0 pada sample kafka-cli dan pacman. File yang benar-benar dibaca:

| File resmi                                                                                                                                                                | Hal yang digunakan                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Root README.adoc](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/README.adoc)                                      | Peran Korvet, Redis Streams, cakupan distribusi, lisensi                               |
| [kafka-cli/docker-compose.yml](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/kafka-cli/docker-compose.yml) | Image 0.19.0, `command: server`, Redis URI, advertised host, indexed topic environment |
| [kafka-cli/README.adoc](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/kafka-cli/README.adoc)               | Client Kafka ke Korvet serta observasi stream `XLEN`/`XRANGE`                          |
| [pacman/package.json](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman/package.json)                   | Referensi KafkaJS 2.2.4                                                                |
| [pacman/server.js](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman/server.js)                         | Producer, admin topic satu partition, send key/value JSON, shutdown                    |
| [pacman/consumer.js](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman/consumer.js)                     | Subscription, `eachMessage`, group, lifecycle                                          |
| [pacman/docker-compose.yml](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/samples/pacman/docker-compose.yml)       | Redis/Korvet healthcheck, advertised host yang dapat dioverride                        |
| [LICENSE](https://github.com/redis-field-engineering/korvet-dist/blob/8ef461e8317b2590edfde386ee810154ef7d0971/LICENSE)                                                   | Notice asli disalin tanpa perubahan ke `docs/licenses/korvet-LICENSE.txt`              |

Ada ketidakkonsistenan teks README kafka-cli yang menyebut tag mengambang walaupun Compose memasang 0.19.0. FieldOps mengikuti pin pada Compose dan tidak membawa instruksi tag mengambang tersebut. Package sample pacman memasang label Apache-2.0, sedangkan LICENSE root pada snapshot menyatakan pemberitahuan komersial; notice root dipertahankan dan tidak diganti dengan asumsi lisensi terbuka.

## Situs dokumentasi Korvet 0.19

Homepage saat pemeriksaan menunjuk dokumentasi stable 0.20. Implementasi lab membaca halaman **version 0.19** berikut, bukan mengambil konfigurasi versi terbaru tanpa memeriksa selector:

| Halaman resmi                                                                                                              | Informasi yang dirujuk                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Dokumentasi utama](https://redis-field-engineering.github.io/korvet/)                                                     | Navigasi dan selector versi                                                             |
| [Konfigurasi 0.19](https://redis-field-engineering.github.io/korvet/0.19/reference/configuration.html)                     | `KORVET_NAMESPACE`, `KORVET_REDIS_URI`, advertised host/port, indexed topic environment |
| [Redis Streams 0.19](https://redis-field-engineering.github.io/korvet/0.19/storage/redis-streams.html)                     | Redis-only satu stream per partition dan perbedaan segmented/tiered storage             |
| [Struktur data 0.19](https://redis-field-engineering.github.io/korvet/0.19/reference/design/internal/data-structures.html) | Format stream key dan field record, committed offset                                    |
| [Kompatibilitas 0.19](https://redis-field-engineering.github.io/korvet/0.19/kafka-api/compatibility.html)                  | Produce/fetch/group/admin, batas transaksi, negosiasi protokol                          |

Commit sumber atau build situs tersebut **tidak dipublikasikan dalam HTML yang diambil**. Repository sumber situs yang diperiksa melalui API GitHub publik mengembalikan 404, sehingga commit build situs tidak dapat ditetapkan secara jujur. Commit dokumentasi/samples distribusi telah dicatat di atas. Untuk mengidentifikasi halaman yang benar-benar dibaca, berikut SHA-256 HTML hasil pengambilan:

```text
configuration.html
7f76089562a77378e43a4be2299ba85f7bb457b4b5ba1c4da4de330a882b6f2e

storage/redis-streams.html
d248495180835a0342e6082e1f8f88f32d0536401c2b21e10f1a55b80376cb1a

reference/design/internal/data-structures.html
9829b4b50cb771ee13dded521510e59091d9b441ad2daaea5295d101da67feff

kafka-api/compatibility.html
9e8db93b73f65248e7e370f43879123ad67f91a619744b71ed0c4519ad978eb8
```

Storage lab memakai satu partition, remoteStorageEnabled=false, compression none. Dokumentasi 0.19 menyebut key tanpa segment untuk Redis-only. Pengujian terhadap image yang dipin menunjukkan key fisik dengan akhiran segment ID:

```text
korvet:storage:local:<topic>:0:0
```

Field value berisi JSON asli, key berisi assetId, dan timestamp berupa angka. Metadata topic pada Redis JSON menunjukkan remoteStorageEnabled=false tetapi segment registry tetap dibuat. Ini adalah perbedaan dokumentasi terhadap distribusi yang ditemukan melalui pengujian, bukan asumsi format internal. Panel menemukan key aktual dengan TYPE dan SCAN terbatas pada prefix partition topic tersebut; suffix segment divalidasi numerik. XLEN adalah panjang stream yang namanya ditampilkan, XRANGE menunjukkan entri terbaru dengan eventId yang dapat dicocokkan. Jika segment bertambah, scaffold menemukan stream tersebut pula.

## Redis

Halaman resmi yang dibaca untuk konsep dan API:

- [Geospatial](https://redis.io/docs/latest/develop/data-types/geospatial/)
- [GEOADD](https://redis.io/docs/latest/commands/geoadd/)
- [GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [XLEN](https://redis.io/docs/latest/commands/xlen/)
- [XRANGE](https://redis.io/docs/latest/commands/xrange/)

GEOSEARCH tersedia sejak Redis 6.2. Distribusi Korvet dapat mensyaratkan fitur Redis tambahan untuk metadata/index, sehingga syarat minimum GEO saja tidak cukup untuk memilih image infrastruktur. Gunakan image yang dipin pada Compose serta hasil pemeriksaan nyata di bawah.

## KafkaJS

- [Producer](https://kafka.js.org/docs/producing)
- [Consumer](https://kafka.js.org/docs/consuming)
- [Konfigurasi client](https://kafka.js.org/docs/configuration)
- [Admin client](https://kafka.js.org/docs/admin)
- [Release/source 2.2.4](https://github.com/tulios/kafkajs/tree/v2.2.4)

Halaman producer/consumer resmi menampilkan versi **2.2.4** pada header ketika dibaca. URL `/docs/2.2.4/producing` bukan endpoint dokumentasi yang valid. Dependency aplikasi dipin `kafkajs: 2.2.4`, mengikuti sample dan API yang dibaca. FieldOps memakai producer non-transactional, satu partition, `subscribe` serta `eachMessage`, tanpa klaim implementasi seluruh fitur Kafka atau exactly-once delivery.

## Versi project dan status verifikasi

Runtime Node dipin **22.22.0**, package manager **npm 10.9.4**. Versi dependency frontend/backend dipin pada `package.json` dan `package-lock.json`; image infrastruktur dipin pada `compose.yaml`. Pin adalah konfigurasi reproducible, sedangkan pengujian runtime adalah bukti terpisah.

Lingkungan awal tidak memiliki Node atau Docker di PATH. Untuk pengujian lokal, Node 22.22.0 dipasang di direktori sementara dan runtime Linux ARM64 disiapkan memakai Lima 2.2.1 (Virtualization.framework). Korvet dijalankan melalui image distribusi resminya di Docker, bukan JAR/source buatan ulang.

| Komponen             | Versi / hasil aktual                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| Node / npm           | 22.22.0 / 10.9.4, host ARM64 dan image Node                                   |
| Redis                | 8.2.3-alpine, GEO dan JSON tersedia                                           |
| Korvet               | v0.19.0, digest di atas, build 2026-07-01                                     |
| KafkaJS              | 2.2.4; non-idempotent send, admin satu partition, subscribe/eachMessage diuji |
| API / web            | Express 4.21.2, React 19.2.0, Vite 7.1.12; dependency exact dan lockfile      |
| Docker / Compose uji | Engine 29.8.2 ARM64 / Compose 5.6.0                                           |
| Browser              | Playwright 1.56.1, Chromium 141 ARM64                                         |

Redis 7.4.6 biasa sempat diuji dan Korvet gagal dengan unknown command JSON.SET. Redis 8.2.3 menyediakan Redis JSON yang diperlukan untuk registry topic. Endpoint instruktur harus menyediakan fitur ini pula.

Manifest multiarch Korvet v0.19.0 menyediakan linux/arm64 dan linux/amd64. Digest ARM64: sha256:eb16aef5a78fc056c0b6ff68873b1084087eb4754e1080a286050f074d621360. Digest AMD64: sha256:1a570cdcd16ea544ecf2410d37a32c33c7b240519fe8f4a038a13af5ecbde105. Runtime ARM64 pada Apple Silicon berhasil tanpa emulasi. Runtime AMD64 serta emulasi AMD64 belum dijalankan; manifest adalah bukti ketersediaan image, bukan hasil runtime platform itu.

Hasil pemeriksaan dan cara mengulangnya ada pada [pengelolaan](operations.md#catatan-verifikasi). Screenshot terpilih berada di `docs/assets/`; hasil lengkap browser di `test-results/screenshots/`.

## Batas aplikasi workshop

- Satu peserta/instance dan satu consumer dashboard/backend; prefix lab bukan isolasi akses.
- Ring buffer serta deduplikasi tampilan dibatasi untuk sesi demo, bukan penyimpanan historis aplikasi produksi.
- Jarak geografis, garis penghubung, sensor, threshold, dan alarm adalah simulasi, bukan navigasi atau kontrol operasi.
- UI peta skematis lokal tidak memerlukan tile internet. Mode OpenStreetMap opsional mempertahankan attribution.
- Validator menggunakan fixture beberapa input dengan timeout dan cleanup milik lab. Helper uji bukan fallback aplikasi.
- Distribusi Korvet adalah komersial. Notice asli dipertahankan; penggunaan production memerlukan lisensi sesuai notice resmi.

## Lisensi dan atribusi

Notice asli distribusi Korvet dipertahankan tanpa perubahan di [licenses/korvet-LICENSE.txt](licenses/korvet-LICENSE.txt). Korvet merupakan produk komersial Redis Ltd.; notice mengatur evaluasi/pengujian internal dan lisensi production. FieldOps memakai distribusi resmi dan bukan source inti atau implementasi ulang Korvet.

Dependency npm dan image mempertahankan lisensi distribusinya. KafkaJS, React, TypeScript, Vite, Express, node-redis, Leaflet dan Lucide dibundel lokal; lisensi dependency tersedia setelah npm ci. Marked 15.0.12 merender panduan lokal; Prettier 3.6.2 menjaga format source. Peta skematis dibuat lokal, mode tile memakai OpenStreetMap dengan attribution.
