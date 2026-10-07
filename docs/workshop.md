# Workshop FieldOps

Dua use case, empat latihan, dua file yang diedit. Target peserta: dapat membaca JavaScript/TypeScript dasar. Koneksi, validasi, UI, simulator, dan lifecycle client telah disiapkan.

| Tahap                         | Waktu       | Yang dicoba                                              |
| ----------------------------- | ----------- | -------------------------------------------------------- |
| Buka konsol dan Mode workshop | 10 menit    | Kenali marker preview dan fitur terkunci                 |
| GEO-01 dan GEO-02             | 25 menit    | Simpan posisi, radius, urutan hasil, perpindahan teknisi |
| KORVET-01 dan KORVET-02       | 30 menit    | Kirim, lihat storage, konsumsi, grafik dan alarm         |
| Eksperimen dan diskusi        | 10–20 menit | Hasil kosong, replay, restart dan layanan terputus       |

Mulai aplikasi sesuai [README](../README.md), lalu buka http://localhost:8088. **Mode workshop** menyediakan tiga tingkat petunjuk. Simpan perubahan, tunggu watcher restart, lalu tekan **Periksa latihan**; semua fitur dinilai dari perilaku fungsi yang sama dengan API.

Peta memakai OpenStreetMap dengan wilayah nyata di Jakarta Pusat. Aset dan teknisi workshop ditempatkan pada titik representatif kecamatan/kelurahan, bukan alamat fasilitas. Nama wilayah serta koordinat awal tersedia pada [data lokasi](assets/jakarta-locations.json). Marker dapat dipilih sebelum latihan selesai; hasil radius tetap berasal dari Redis setelah validasi.

## GEO-01

**File:** `apps/api/src/labs/geo.ts` · **Operasi:** `GEOADD`

```ts
saveTechnicianPosition(redis, key, technicianId, position): Promise<void>
```

Input: client terhubung, key dari caller, ID teknisi, dan `{ longitude, latitude }`. Isi command untuk menyimpan atau memperbarui member teknisi. Promise selesai setelah Redis menerima penyimpanan.

Redis mengelola index koordinat sehingga perubahan lokasi dapat langsung digunakan pencarian. Member adalah ID teknisi; penulisan ulang ID yang sama memperbarui posisi. Urutan command selalu **longitude, lalu latitude**. Redis membatasi longitude −180…180 dan latitude sekitar −85,051…85,051; API sudah memvalidasi angka.

**Uji di konsol:** setelah lulus, pilih teknisi dan gunakan **Perbarui posisi**. Marker kemudian berlabel sumber Redis. Validator memeriksa posisi tersimpan, beberapa ID/pusat koordinat, serta update ID yang sama.

<details>
<summary>Petunjuk 1 — konsep</summary>

Gunakan ID teknisi sebagai member. Key dan posisi harus berasal dari parameter agar input lain tetap bekerja.

</details>
<details>
<summary>Petunjuk 2 — API</summary>

Node-redis menyediakan `redis.geoAdd(key, { longitude, latitude, member })`. Tunggu operasi dengan `await`.

</details>
<details>
<summary>Petunjuk 3 — alur parsial</summary>

```text
await geoAdd(key, {
  longitude: position.…,
  latitude: position.…,
  member: …
})
```

</details>

## GEO-02

**File:** `apps/api/src/labs/geo.ts` · **Operasi:** `GEOSEARCH`

```ts
findNearbyTechnicians(redis, key, center, radiusKm): Promise<GeoHit[]>
```

Input: index teknisi, pusat gangguan `{ longitude, latitude }`, radius kilometer. Isi command `GEOSEARCH` dengan `FROMLONLAT`, `BYRADIUS`, `km`, `ASC`, `WITHDIST`, dan `WITHCOORD`. Kembalikan hasil melalui `parseGeoReply(reply)`; helper hanya mengubah bentuk reply Redis.

Setiap hasil: `{ technicianId, distanceKm, longitude, latitude }`. Tidak ada hasil berarti `[]`. Contoh dari Aset A-101 di Gambir `(106.8167439, -6.1711625)`: radius 1 km memuat T-01 di Petojo Selatan sekitar 0,43 km dan T-02 di Petojo Utara sekitar 0,64 km. Radius 3 km memuat enam teknisi, diurutkan dari yang terdekat. Angka ini berasal dari koordinat awal dataset; hasil berubah setelah posisi diperbarui.

**Uji di konsol:** pilih Aset A-101, cari radius 1/3/5 km, lalu pilih teknisi. Pindahkan T-01 ke koordinat contoh Cempaka Putih `(106.8685256, -6.1812095)` melalui form dan ulangi pencarian 1 km; T-01 keluar dari hasil. Kembalikan ke Petojo Selatan `(106.8164340, -6.1750093)` untuk mencoba lagi. Coba titik jauh untuk hasil kosong. Validator membandingkan anggota, urutan, jarak, dan koordinat terhadap Redis pada beberapa pusat/radius.

Jarak adalah jarak geografis. Garis peta merupakan penghubung lokasi, tanpa rute jalan atau estimasi tiba. Index hanya berisi teknisi; marker aset berasal dari metadata terpisah.

<details>
<summary>Petunjuk 1 — konsep</summary>

Redis memilih anggota dalam lingkaran dan mengurutkan dari yang terdekat. Pusat/radius harus memakai input fungsi.

</details>
<details>
<summary>Petunjuk 2 — API</summary>

`redis.sendCommand` menerima array string. Ubah angka menjadi string, minta jarak/koordinat, lalu gunakan `parseGeoReply`.

</details>
<details>
<summary>Petunjuk 3 — alur parsial</summary>

```text
reply = await sendCommand([
  "GEOSEARCH", key,
  "FROMLONLAT", <lon pusat>, <lat pusat>,
  "BYRADIUS", <radius>, <unit>,
  <urutan>, <opsi jarak>, <opsi koordinat>
])
return parseGeoReply(reply)
```

</details>

## KORVET-01

**File:** `apps/api/src/labs/korvet.ts` · **Operasi:** `producer.send`

```ts
publishTelemetry(producer, topic, event): Promise<void>
```

Input: producer terhubung, topic dari caller, dan satu event valid. Isi pengiriman satu record dengan key `event.assetId` dan value `JSON.stringify(event)`. Korvet menerima protokol Kafka dan menulis Redis Streams; producer aplikasi terhubung langsung ke Korvet.

| Istilah           | Peran                                                         |
| ----------------- | ------------------------------------------------------------- |
| Producer          | Mengirim record melalui KafkaJS                               |
| Topic / partition | Aliran telemetry; lab memakai satu partition, nomor 0         |
| Consumer / group  | Pembaca dan identitas offset; group dashboard tetap untuk lab |
| Redis Streams     | Penyimpanan log event oleh Korvet                             |
| SSE               | Koneksi backend ke browser untuk pembaruan dashboard          |

```json
{
  "eventId": "99d0aa43-8b5c-40f4-8011-43e15150e65e",
  "assetId": "A-101",
  "timestamp": "2026-10-07T02:00:00.000Z",
  "temperatureC": 64.5,
  "voltageV": 228.0,
  "currentA": 18.4
}
```

**Uji di konsol:** setelah lulus, mulai simulator dan buka **Penyimpanan Redis**. Cocokkan `eventId` pada JSON dengan perjalanan event. Balasan producer hanya membuktikan pengiriman; grafik menunggu consumer. Validator menggunakan consumer uji untuk memeriksa dua payload berbeda beserta key dan storage aktual.

<details>
<summary>Petunjuk 1 — konsep</summary>

Kirim ke topic yang diberikan. Key mengenali aset; value merupakan JSON event lengkap. Redis ditulis oleh Korvet.

</details>
<details>
<summary>Petunjuk 2 — API</summary>

`producer.send({ topic, messages: [{ key, value }] })`. Gunakan parameter event untuk kedua field record.

</details>
<details>
<summary>Petunjuk 3 — alur parsial</summary>

```text
await send({ topic, messages: [{
  key: event.…,
  value: JSON.stringify(…)
}] })
```

</details>

## KORVET-02

**File:** `apps/api/src/labs/korvet.ts` · **Operasi:** `subscribe` dan `run`

```ts
consumeTelemetry(consumer, topic, onEvent): Promise<void>
```

Input: consumer terhubung, topic dan callback scaffold. Subscribe dengan `fromBeginning: true`, lalu pasang `eachMessage` melalui `consumer.run`. Parse `message.value` dengan `parseTelemetry`; panggil `await onEvent(event)` hanya untuk event valid.

Return merupakan selesainya setup consumer. Event berikutnya diteruskan lewat callback. `fromBeginning` berlaku jika group belum memiliki committed offset. Satu consumer backend melayani seluruh browser; `eventId` mencegah tampilan ganda untuk replay dalam sesi, tanpa jaminan exactly-once.

**Uji di konsol:** jalankan **Normal**, **Temperatur meningkat**, dan **Tegangan turun**. Grafik, tabel dan alarm harus berasal dari event consumer. Ambang simulasi: temperatur >80 °C atau tegangan <210 V. Hentikan simulator, bandingkan eventId dengan storage, lalu coba mulai ulang consumer pada Mode workshop. Validator memakai producer uji dan membandingkan dua eventId/payload yang diterima dengan timeout.

<details>
<summary>Petunjuk 1 — konsep</summary>

Subscription menentukan topic. Loop consumer menangani record setelah fetch dari Korvet, kemudian meneruskannya ke callback.

</details>
<details>
<summary>Petunjuk 2 — API</summary>

Gunakan `subscribe({ topic, fromBeginning: true })` dan `run({ eachMessage: async ({ message }) => … })`. Helper parsing mengembalikan event atau `undefined`.

</details>
<details>
<summary>Petunjuk 3 — alur parsial</summary>

```text
await subscribe(topic, fromBeginning)
await run({ eachMessage: async payload => {
  event = parseTelemetry(<message value>)
  jika valid: await <callback>(event)
} })
```

</details>

## Membaca hasil pemeriksaan

| Status                         | Tindakan                                                |
| ------------------------------ | ------------------------------------------------------- |
| Belum diisi                    | Ganti stub `WorkshopTodoError` pada latihan tersebut    |
| Implementasi belum benar       | Periksa pesan, parameter, `await`, return atau callback |
| Dependensi lab belum selesai   | Selesaikan GEO-01 dan siapkan posisi sebelum pencarian  |
| Infrastruktur tidak tersambung | Periksa koneksi Redis/Korvet pada panel infrastruktur   |

Jawaban lengkap berada di `workshop/solutions/`. Cara menerapkan, backup dan reset ada dalam [panduan pengelolaan](operations.md#jawaban-dan-reset).

Diskusikan: bagaimana membedakan marker preview dari data Redis, mengapa ack producer belum berarti consumer menerima event, dan bukti apa yang menghubungkan event pada storage dengan dashboard?
