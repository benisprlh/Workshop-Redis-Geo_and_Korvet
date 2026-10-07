import { useState } from 'react';
import { ArrowRight, Search, ArrowUpRight, Clock3, MapPin, Radio } from 'lucide-react';
import type { Snapshot, ExerciseId } from '@fieldops/contracts';
import { Badge, Empty } from '../../shared/ui';
import { number, time } from '../../shared/api';

import { assetStatus } from '../../shared/asset-status';

export default function OverviewPage({
  state: s,
  navigate,
  open,
}: {
  state: Snapshot;
  navigate: (page: 'geo' | 'monitor', assetId?: string) => void;
  open: (id?: ExerciseId) => void;
}) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const attention = s.assets.filter((a) => assetStatus(s, a.id).tone === 'amber').length;
  const rows = s.assets
    .filter(
      (a) =>
        (!area || a.area === area) &&
        `${a.name} ${a.type}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(assetStatus(s, b.id).tone === 'amber') -
        Number(assetStatus(s, a.id).tone === 'amber'),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ringkasan</h1>
          <p>Aset dan kesiapan tim di area simulasi.</p>
        </div>
        <button className="button primary" onClick={() => navigate('geo')}>
          Buka penugasan <ArrowRight size={16} />
        </button>
      </div>
      <div className="operation-strip">
        <div>
          <span>Aset terdaftar</span>
          <strong>
            {s.assets.length}
            <small>aset</small>
          </strong>
          <span className="stat-source">Metadata aset simulasi</span>
        </div>
        <div>
          <span>Perlu perhatian</span>
          <strong className={attention ? 'text-amber' : ''}>
            {attention}
            <small>aset</small>
          </strong>
          <span className="stat-source">Event terakhir tiap aset</span>
        </div>
        <div>
          <span>Teknisi tersedia</span>
          <strong>
            {s.technicians.filter((t) => t.status === 'available').length}
            <small>dari {s.technicians.length}</small>
          </strong>
          <span className="stat-source">Status metadata teknisi</span>
        </div>
        <div>
          <span>Event diterima</span>
          <strong>
            {number(s.counts.received, 0)}
            <small>sesi ini</small>
          </strong>
          <span className="stat-source">Consumer dashboard</span>
        </div>
      </div>
      <div className="overview-columns">
        <section className="panel asset-panel">
          <div className="section-heading">
            <div>
              <h2>Status aset</h2>
              <p>Aset yang perlu perhatian tampil lebih awal.</p>
            </div>
            <Badge>{s.assets.length} aset</Badge>
          </div>
          <div className="table-toolbar">
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="Cari aset"
                placeholder="Cari ID atau jenis aset"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select aria-label="Filter area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Semua area</option>
              {[...new Set(s.assets.map((a) => a.area))].sort().map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Aset / jenis</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th className="numeric">Temperatur</th>
                  <th>Update</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const status = assetStatus(s, a.id);
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <small>{a.type}</small>
                      </td>
                      <td>{a.area}</td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="numeric">
                        {status.event ? `${number(status.event.temperatureC)} °C` : '—'}
                      </td>
                      <td className="tabular muted">{time(status.event?.timestamp)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Pantau ${a.name}`}
                          title={`Pantau ${a.name}`}
                          onClick={() => navigate('monitor', a.id)}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty
              title="Tidak ada aset yang sesuai"
              detail="Ubah kata pencarian atau pilihan area."
            />
          )}
          <div className="table-footer">
            {rows.length} dari {s.assets.length} aset{' '}
            <span>Semua nilai sensor adalah simulasi</span>
          </div>
        </section>
        <aside className="overview-aside">
          <section className="panel readiness">
            <div className="section-heading">
              <h2>Kesiapan lapangan</h2>
              <MapPin size={17} />
            </div>
            <p className="muted">Posisi teknisi</p>
            <strong className="readiness-number">
              {s.technicians.filter((t) => t.positionSource === 'redis').length}
              <span> / {s.technicians.length}</span>
            </strong>
            <p className="muted">
              {s.positionsReady
                ? 'Posisi tersedia pada index Redis.'
                : 'Marker preview tersedia. Index belum disiapkan.'}
            </p>
            <button
              className="text-button"
              onClick={() => (s.positionsReady ? navigate('geo') : open('GEO-01'))}
            >
              {s.positionsReady ? 'Lihat penugasan' : 'Siapkan lewat latihan'}
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="panel activity-panel">
            <div className="section-heading">
              <h2>Aktivitas terbaru</h2>
              <Clock3 size={16} />
            </div>
            <div className="activity-list">
              {s.activities.slice(0, 6).map((a) => (
                <div className="activity" key={a.id}>
                  <span className={`activity-dot ${a.kind}`} />
                  <div>
                    <p>{a.message}</p>
                    <time>{time(a.timestamp)}</time>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <div className="source-note">
        <Radio size={14} />
        Sensor terakhir dari consumer · data berusia lebih dari 30 detik ditandai “Data tidak baru”.
      </div>
    </>
  );
}
