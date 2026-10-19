import { Check, Circle, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { RedisConnection } from '@fieldops/contracts';
import { Badge } from '../../shared/ui';
import { time } from '../../shared/api';

export default function RedisConnectionPanel({ connection }: { connection: RedisConnection }) {
  const endpoint = connection.endpoint;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copyPath() {
    try {
      await navigator.clipboard.writeText('.env');
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Buka file .env pada root repository di editor.');
    }
  }
  const labels = {
    unchecked: 'Belum diperiksa',
    checking: 'Memeriksa…',
    passed: 'Terverifikasi',
    failed: 'Periksa konfigurasi',
    local: 'Lokal · terkunci',
  };
  return (
    <section className="exercise-detail connection-detail" aria-label="Persiapan koneksi Redis">
      <div className="exercise-detail-heading">
        <h3>Koneksi Redis</h3>
        <Badge
          tone={
            connection.status === 'passed'
              ? 'green'
              : ['failed', 'local'].includes(connection.status)
                ? 'amber'
                : 'neutral'
          }
        >
          {labels[connection.status]}
        </Badge>
      </div>
      <div className="exercise-path">
        <code>.env</code>
        <button
          className="icon-button"
          aria-label="Salin path konfigurasi"
          title="Salin path"
          onClick={() => void copyPath()}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <dl className="connection-endpoint">
        <dt>Endpoint backend</dt>
        <dd>{endpoint.host ? `${endpoint.host}:${endpoint.port}` : 'Belum dikonfigurasi'}</dd>
        <dt>Transport</dt>
        <dd>{endpoint.host ? (endpoint.tls ? 'TLS · rediss://' : 'Tanpa TLS · redis://') : '—'}</dd>
        <dt>Kredensial</dt>
        <dd>
          {endpoint.credentialsConfigured ? 'Dikonfigurasi di backend' : 'Tidak dikonfigurasi'}
        </dd>
        <dt>Database</dt>
        <dd>{endpoint.host ? endpoint.database : '—'}</dd>
      </dl>
      {copyError && (
        <p className="inline-error" role="alert">
          {copyError}
        </p>
      )}
      <details
        className="connection-instructions"
        open={['unchecked', 'failed'].includes(connection.status)}
      >
        <summary>Langkah menghubungkan Redis</summary>
        <ol className="connection-steps">
          <li>
            <strong>Isi endpoint database</strong>
            <p>
              Ubah REDIS_URL di .env sesuai endpoint, port, dan akun Redis Enterprise dari
              instruktur. Redis lokal bawaan hanya koneksi awal; latihan memerlukan endpoint lain.
            </p>
          </li>
          <li>
            <strong>Terapkan konfigurasi backend</strong>
            <p>
              Jalankan ulang layanan dengan perintah Compose sesuai mode lab pada panduan. Perubahan
              .env memerlukan recreate container.
            </p>
          </li>
          <li>
            <strong>Periksa koneksi</strong>
            <p>
              Pemeriksaan memakai PING serta key sementara untuk baca/tulis dan cleanup. Setelah
              lulus pada endpoint nonlokal, lanjutkan GEO-01.
            </p>
          </li>
        </ol>
      </details>
      <details className="connection-tls">
        <summary>Konfigurasi TLS dan sertifikat</summary>
        <p>
          Gunakan rediss:// untuk TLS. Jika memakai CA privat, isi REDIS_CA_FILE. Mutual TLS memakai
          REDIS_CLIENT_CERT_FILE dan REDIS_CLIENT_KEY_FILE. Sertifikat berada di backend.
        </p>
        <p>
          CA: {endpoint.caConfigured ? 'Dikonfigurasi' : 'Trust store sistem'} · Sertifikat client:{' '}
          {endpoint.clientCertificateConfigured ? 'Dikonfigurasi' : 'Tidak dikonfigurasi'}
        </p>
      </details>
      <div className="connection-checks" aria-label="Hasil pemeriksaan koneksi">
        {(
          [
            ['ping', 'PING'],
            ['writeRead', 'Baca/tulis'],
            ['cleanup', 'Cleanup'],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className={connection.checks[key] ? 'done' : ''}>
            {connection.checks[key] ? <Check size={13} /> : <Circle size={12} />}
            {label}
          </span>
        ))}
      </div>
      <p
        className={`exercise-message ${['failed', 'local'].includes(connection.status) ? 'warning' : ''}`}
        role="status"
      >
        {connection.message}
        {connection.checkedAt && <small>Diperiksa {time(connection.checkedAt)}</small>}
      </p>
      <a className="text-button" href="/api/guide#koneksi-redis" target="_blank" rel="noreferrer">
        Baca panduan koneksi
        <ExternalLink size={12} />
      </a>
    </section>
  );
}
