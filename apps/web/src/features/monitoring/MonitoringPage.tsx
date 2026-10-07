import { useEffect, useState } from 'react';
import {
  Play,
  Square,
  Radio,
  Database,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Check,
  ArrowRight,
} from 'lucide-react';
import type { Snapshot, ExerciseId, Scenario, StorageSnapshot } from '@fieldops/contracts';
import { request, time, number } from '../../shared/api';
import { Badge, Empty, Locked } from '../../shared/ui';
import { assetStatus } from '../../shared/asset-status';
import Chart from './SensorChart';

export default function MonitoringPage({
  state: s,
  initialAsset,
  open,
}: {
  state: Snapshot;
  initialAsset?: string;
  open: (id?: ExerciseId) => void;
}) {
  const [assetId, setAssetId] = useState(initialAsset || s.simulator.assetId);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageOpen, setStorageOpen] = useState(false);
  const [storage, setStorage] = useState<StorageSnapshot>();
  const [storageError, setStorageError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const producerUnlocked = s.exercises.find((e) => e.id === 'KORVET-01')?.status === 'passed';
  const consumerUnlocked = s.exercises.find((e) => e.id === 'KORVET-02')?.status === 'passed';
  const events = s.events.filter((e) => e.assetId === assetId);
  const latest = events.at(-1);
  const status = assetStatus(s, assetId);
  const alarms = s.alarms.filter((a) => a.assetId === assetId);
  const journey =
    s.journeys.find((j) => j.eventId === selectedEvent) ||
    s.journeys.find((j) => j.assetId === assetId);
  async function simulate() {
    setBusy(true);
    setError('');
    try {
      await request(
        s.simulator.running ? '/simulator/stop' : '/simulator/start',
        'POST',
        s.simulator.running ? {} : { assetId, scenario },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    try {
      const evidence = await request<StorageSnapshot & { error?: string }>('/storage');
      setStorage(evidence);
      setStorageError(evidence.error || '');
    } catch (e) {
      setStorageError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!storageOpen) return;
    void inspect();
    const timer = setInterval(() => {
      void inspect();
    }, 4000);
    return () => clearInterval(timer);
  }, [storageOpen]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Monitoring Aset</h1>
          <p>Sensor simulasi melalui Korvet dan Redis Streams.</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="monitor-toolbar panel">
        <label className="field">
          Aset
          <select
            aria-label="Pilih aset monitoring"
            value={assetId}
            disabled={s.simulator.running}
            onChange={(e) => {
              setAssetId(e.target.value);
              setSelectedEvent('');
            }}
          >
            {s.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.area}
              </option>
            ))}
          </select>
        </label>
        <label className="field scenario-field">
          Skenario simulasi
          <select
            aria-label="Skenario simulasi"
            value={scenario}
            disabled={s.simulator.running}
            onChange={(e) => setScenario(e.target.value as Scenario)}
          >
            <option value="normal">Normal</option>
            <option value="temperature">Temperatur meningkat</option>
            <option value="voltage">Tegangan turun</option>
          </select>
        </label>
        <div className="simulator-control">
          <span>Interval 2,5 detik</span>
          <button
            className={`button ${s.simulator.running ? 'secondary' : 'primary'}`}
            disabled={!producerUnlocked || busy || (!s.infra.producer && !s.simulator.running)}
            onClick={simulate}
          >
            {s.simulator.running ? <Square size={14} /> : <Play size={14} />}{' '}
            {s.simulator.running ? 'Hentikan simulasi' : 'Mulai simulasi'}
          </button>
        </div>
      </div>
      {(!producerUnlocked || error || s.simulator.error) && (
        <div className="monitor-feedback">
          {!producerUnlocked ? (
            <Locked id="KORVET-01" open={open} compact />
          ) : (
            <p className="inline-error" role="alert">
              {error || s.simulator.error}
            </p>
          )}
        </div>
      )}
      <div className="connection-strip">
        <span>
          <i className={s.infra.producer ? 'dot green' : 'dot'} />
          Producer {s.infra.producer ? 'terkoneksi' : 'terputus'}
        </span>
        <span>
          <i className={s.infra.consumer ? 'dot green' : 'dot'} />
          Consumer {s.infra.consumer ? 'berjalan' : 'belum aktif'}
        </span>
        <span>
          <Radio size={13} />
          <strong>{s.counts.received}</strong> event diterima
        </span>
        <span className="last-update">Update {time(latest?.timestamp)}</span>
      </div>
      <div className="monitor-main">
        <div className="charts-column">
          <div className="charts-group panel">
            <Chart
              events={events}
              metric="temperatureC"
              threshold={s.thresholds.temperatureC}
              title="Temperatur"
              unit="°C"
            />
            <Chart
              events={events}
              metric="voltageV"
              threshold={s.thresholds.voltageV}
              title="Tegangan"
              unit="V"
            />
            {!consumerUnlocked && (
              <div className="chart-lock">
                <Locked id="KORVET-02" open={open} compact />
              </div>
            )}
          </div>
          <p className="source-note">
            Grafik hanya memakai event consumer · 30 titik terakhir · waktu lokal browser
          </p>
        </div>
        <aside className="panel alarms-panel">
          <div className="section-heading">
            <div>
              <h2>Alarm sensor</h2>
              <p>Ambang simulasi</p>
            </div>
            <Badge tone={alarms.length ? 'amber' : 'neutral'}>{alarms.length}</Badge>
          </div>
          <div className="threshold-list">
            <span>
              Temperatur <strong>&gt; {s.thresholds.temperatureC} °C</strong>
            </span>
            <span>
              Tegangan <strong>&lt; {s.thresholds.voltageV} V</strong>
            </span>
          </div>
          {alarms.length ? (
            <div className="alarm-list">
              {alarms.slice(0, 6).map((a) => (
                <button
                  key={`${a.eventId}-${a.kind}`}
                  className="alarm-row"
                  onClick={() => setSelectedEvent(a.eventId)}
                >
                  <AlertTriangle size={15} />
                  <span>
                    <strong>
                      {a.kind === 'temperature' ? 'Temperatur tinggi' : 'Tegangan rendah'}
                    </strong>
                    <small>{a.message}</small>
                    <time>
                      {time(a.timestamp)} · {a.assetId}
                    </time>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={latest ? 'Tidak ada alarm' : 'Belum ada pembacaan'}
              detail={
                latest
                  ? 'Nilai terakhir berada dalam ambang simulasi.'
                  : 'Alarm muncul dari event yang diterima consumer.'
              }
            />
          )}
          <div className="alarm-footer">Alarm tersimpan untuk sesi demo ini.</div>
        </aside>
      </div>
      <section className="panel journey-panel">
        <div className="journey-title">
          <h3>Perjalanan event</h3>
          <span className="mono">
            {journey ? `${journey.eventId.slice(0, 8)}…` : 'Menunggu event'}
          </span>
        </div>
        <div className="journey-stages">
          {[
            ['Dikirim', journey?.sentAt],
            ['Tersimpan', journey?.storedAt],
            ['Diterima consumer', journey?.receivedAt],
          ].map(([label, date], i) => (
            <div key={label}>
              <span className={`stage ${date ? 'done' : ''}`}>
                {date ? <Check size={13} /> : i + 1}
              </span>
              <span>
                <strong>{label}</strong>
                <small>{date ? time(date) : 'Belum terbukti'}</small>
              </span>
              {i < 2 && <ArrowRight size={16} className="stage-arrow" />}
            </div>
          ))}
        </div>
      </section>
      <section className="panel event-panel">
        <div className="section-heading">
          <div>
            <h2>Event terbaru</h2>
            <p>{assetId} · klik baris untuk melihat perjalanan event</p>
          </div>
          <span className="muted">{events.length} dalam buffer</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Event ID</th>
                <th className="numeric">Temperatur</th>
                <th className="numeric">Tegangan</th>
                <th className="numeric">Arus</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events
                .slice(-8)
                .reverse()
                .map((e) => (
                  <tr
                    key={e.eventId}
                    className={`clickable ${selectedEvent === e.eventId ? 'selected' : ''}`}
                    onClick={() => setSelectedEvent(e.eventId)}
                  >
                    <td className="tabular">{time(e.timestamp)}</td>
                    <td>
                      <button
                        className="text-button mono"
                        title={e.eventId}
                        onClick={() => setSelectedEvent(e.eventId)}
                      >
                        {e.eventId.slice(0, 12)}…
                      </button>
                    </td>
                    <td className="numeric">{number(e.temperatureC)} °C</td>
                    <td className="numeric">{number(e.voltageV)} V</td>
                    <td className="numeric">{number(e.currentA)} A</td>
                    <td>
                      <Badge
                        tone={
                          e.temperatureC > s.thresholds.temperatureC ||
                          e.voltageV < s.thresholds.voltageV
                            ? 'amber'
                            : 'green'
                        }
                      >
                        {e.temperatureC > s.thresholds.temperatureC ||
                        e.voltageV < s.thresholds.voltageV
                          ? 'Perlu perhatian'
                          : 'Normal'}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!events.length && (
          <div className="event-empty">
            Belum ada event untuk aset ini. Jalankan simulasi setelah latihan Korvet selesai.
          </div>
        )}
      </section>
      <section className="panel storage-panel">
        <button
          className="storage-toggle"
          aria-expanded={storageOpen}
          onClick={() => setStorageOpen((v) => !v)}
        >
          <Database size={17} />
          <span>
            <strong>Penyimpanan Redis</strong>
            <small>XLEN dan XRANGE · read-only</small>
          </span>
          <ChevronDown size={17} className={storageOpen ? 'rotate' : ''} />
        </button>
        {storageOpen && (
          <div className="storage-body">
            <div className="storage-meta">
              <code>{storage?.streamKey || 'Memuat stream key…'}</code>
              <span>
                XLEN <strong>{storage ? storage.length : '—'}</strong>
              </span>
              <button
                className="button secondary small"
                onClick={() => {
                  void inspect();
                }}
              >
                <RefreshCw size={13} />
                Perbarui
              </button>
            </div>
            {storage && storage.streams.length > 1 && (
              <div className="storage-stream-list">
                {storage.streams.map((stream) => (
                  <div key={stream.key}>
                    <code>{stream.key}</code>
                    <span>
                      XLEN <strong>{stream.length}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {storageError && (
              <p className="inline-error" role="alert">
                {storageError}
              </p>
            )}
            {storage?.entries.length ? (
              <div className="storage-entries">
                {storage.entries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <details key={`${entry.streamKey}-${entry.id}`}>
                      <summary title={entry.streamKey}>
                        <span className="mono">{entry.id}</span>
                        <span>{entry.key || '—'}</span>
                        <span className="mono">{entry.event?.eventId || 'Payload non-JSON'}</span>
                      </summary>
                      <pre>{JSON.stringify(entry.fields, null, 2)}</pre>
                    </details>
                  ))}
              </div>
            ) : (
              <p className="muted">{storage ? 'Stream belum memiliki entri.' : 'Membaca Redis…'}</p>
            )}
            <p className="tiny-note">
              {storage ? `Diperiksa ${time(storage.checkedAt)}. ` : ''}Cocokkan eventId di value
              dengan tabel event. Key stream aktual ditemukan dalam namespace topic lab. XRANGE
              dibaca per stream, tanpa mengubah data.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
