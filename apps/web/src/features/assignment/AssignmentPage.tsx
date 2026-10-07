import { useEffect, useState } from 'react';
import { Crosshair, Search, MapPin, Save, ChevronRight } from 'lucide-react';
import type { Snapshot, ExerciseId, Position, NearbyTechnician } from '@fieldops/contracts';
import { Badge, Empty, Locked } from '../../shared/ui';
import { request, number } from '../../shared/api';
import FieldMap from './FieldMap';

export default function AssignmentPage({
  state: s,
  open,
}: {
  state: Snapshot;
  open: (id?: ExerciseId) => void;
}) {
  const [assetId, setAssetId] = useState(s.assets[0].id);
  const [center, setCenter] = useState<Position>(s.assets[0]);
  const [radius, setRadius] = useState(3);
  const [results, setResults] = useState<NearbyTechnician[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState('T-01');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selected = s.technicians.find((t) => t.id === selectedId)!;
  const [longitude, setLongitude] = useState(String(selected.longitude));
  const [latitude, setLatitude] = useState(String(selected.latitude));
  useEffect(() => {
    setLongitude(String(selected.longitude));
    setLatitude(String(selected.latitude));
  }, [selectedId, selected.longitude, selected.latitude]);
  useEffect(() => setSuccess(''), [selectedId]);
  const saveUnlocked = s.exercises.find((e) => e.id === 'GEO-01')?.status === 'passed';
  const searchUnlocked =
    s.exercises.find((e) => e.id === 'GEO-02')?.status === 'passed' && s.positionsReady;
  function choose(id: string) {
    const asset = s.assets.find((a) => a.id === id);
    if (asset) {
      setAssetId(id);
      setCenter(asset);
      setSearched(false);
      setResults([]);
    }
  }
  async function search() {
    setBusy(true);
    setError('');
    try {
      const response = await request<{ results: NearbyTechnician[] }>('/geo/search', 'POST', {
        center: { longitude: center.longitude, latitude: center.latitude },
        radiusKm: radius,
      });
      setResults(response.results);
      setSearched(true);
      if (response.results.length) setSelectedId(response.results[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const lon = Number(longitude),
      lat = Number(latitude);
    if (
      !longitude.trim() ||
      !latitude.trim() ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      lon < -180 ||
      lon > 180 ||
      lat < -85.05112878 ||
      lat > 85.05112878
    ) {
      setError('Longitude −180…180; latitude −85,051…85,051. Gunakan titik desimal.');
      return;
    }
    setBusy(true);
    try {
      await request(`/technicians/${selectedId}/position`, 'PUT', {
        longitude: lon,
        latitude: lat,
      });
      setSuccess('Posisi tersimpan di Redis. Cari kembali untuk melihat perubahan.');
      setSearched(false);
      setResults([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Penugasan Lapangan</h1>
          <p>Tentukan titik gangguan dan temukan teknisi dalam radius.</p>
        </div>
        <Badge tone={s.positionsReady ? 'green' : 'neutral'}>
          {s.positionsReady ? 'Posisi dari Redis' : 'Marker preview'}
        </Badge>
      </div>
      <div className="geo-layout">
        <section className="map-panel">
          <FieldMap
            assets={s.assets}
            technicians={s.technicians}
            center={center}
            assetId={assetId}
            selectedId={selectedId}
            results={results}
            radiusKm={radius}
            searched={searched}
            onAsset={choose}
            onTech={setSelectedId}
            onPoint={(p) => {
              setCenter(p);
              setAssetId('');
              setSearched(false);
              setResults([]);
            }}
          />
          <div className="map-caption">
            <Crosshair size={14} />
            Klik aset atau titik pada peta untuk menentukan lokasi gangguan. Garis hanya penghubung
            lokasi.
          </div>
        </section>
        <aside className="panel assignment-panel">
          <div className="section-heading">
            <h2>Cari teknisi</h2>
            <Search size={17} />
          </div>
          <div className="assignment-body">
            <label className="field">
              Lokasi gangguan
              <select value={assetId} onChange={(e) => choose(e.target.value)}>
                {!assetId && <option value="">Titik pada peta</option>}
                {s.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.area}
                  </option>
                ))}
              </select>
            </label>
            <p className="coordinate-readout">
              <MapPin size={13} />
              <span>
                {center.longitude.toFixed(5)}, {center.latitude.toFixed(5)}
              </span>
              <small>lon, lat</small>
            </p>
            <label className="field">
              Radius pencarian{' '}
              <span className="segmented">
                {[1, 3, 5, 10].map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={radius === r}
                    className={radius === r ? 'active' : ''}
                    onClick={() => {
                      setRadius(r);
                      setSearched(false);
                      setResults([]);
                    }}
                  >
                    {r} km
                  </button>
                ))}
              </span>
            </label>
            <button
              className="button primary full"
              disabled={!searchUnlocked || busy}
              onClick={search}
            >
              <Search size={16} />
              {busy ? 'Memproses…' : 'Cari teknisi terdekat'}
            </button>
            {!searchUnlocked && <Locked id="GEO-02" open={open} compact />}
            <div className="results-heading">
              <h3>Hasil pencarian</h3>
              <span>{searched ? `${results.length} teknisi` : '—'}</span>
            </div>
            {searched ? (
              results.length ? (
                <div className="technician-results">
                  {results.map((t, i) => (
                    <button
                      className={`technician-row ${selectedId === t.id ? 'selected' : ''}`}
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <span className="result-rank">{i + 1}</span>
                      <span className="result-text">
                        <strong>{t.name}</strong>
                        <small>{t.skills.join(' · ')}</small>
                        <span className={`availability ${t.status}`}>
                          {t.status === 'available' ? 'Tersedia' : 'Bertugas'}
                        </span>
                      </span>
                      <span className="distance">
                        {number(t.distanceKm, 2)}
                        <small>km</small>
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Tidak ada teknisi dalam radius"
                  detail="Perbesar radius atau pilih lokasi lain."
                />
              )
            ) : (
              <div className="result-placeholder">Hasil dari Redis muncul setelah pencarian.</div>
            )}
            <p className="tiny-note">Jarak geografis, bukan jarak jalan atau estimasi tiba.</p>
          </div>
          <div className="technician-detail">
            <div className="detail-heading">
              <div>
                <span className="detail-label">Teknisi terpilih</span>
                <h3>{selected.name}</h3>
              </div>
              <Badge tone={selected.status === 'available' ? 'green' : 'amber'}>
                {selected.status === 'available' ? 'Tersedia' : 'Bertugas'}
              </Badge>
            </div>
            <p className="muted">
              {selected.area} · {selected.skills.join(', ')}
            </p>
            <p className="position-origin">
              Posisi:{' '}
              {selected.positionSource === 'redis'
                ? 'index Redis GEO'
                : 'pratinjau metadata simulasi'}
            </p>
            <form onSubmit={save}>
              <div className="coordinate-form">
                <label className="field">
                  Longitude
                  <input
                    aria-label="Longitude teknisi"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Latitude
                  <input
                    aria-label="Latitude teknisi"
                    type="number"
                    step="any"
                    min="-85.05112878"
                    max="85.05112878"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    required
                  />
                </label>
              </div>
              <p className="coordinate-order">Urutan Redis: longitude, lalu latitude.</p>
              <button
                className="button secondary full"
                type="submit"
                disabled={!saveUnlocked || busy}
              >
                <Save size={15} />
                Perbarui posisi
              </button>
            </form>
            {!saveUnlocked && <Locked id="GEO-01" open={open} compact />}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="inline-success" role="status">
                {success}
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
