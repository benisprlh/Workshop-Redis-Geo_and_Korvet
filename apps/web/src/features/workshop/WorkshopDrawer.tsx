import { useEffect, useRef, useState } from 'react';
import { X, Check, Circle, ExternalLink, RefreshCw, Copy, ChevronDown } from 'lucide-react';
import type { Snapshot, ExerciseId, Hint, ExerciseStatus } from '@fieldops/contracts';
import { request, time } from '../../shared/api';
import { Badge } from '../../shared/ui';

const statusLabels: Record<ExerciseStatus, string> = {
  todo: 'Belum diisi',
  incorrect: 'Implementasi belum benar',
  dependency: 'Dependensi lab belum selesai',
  infrastructure: 'Infrastruktur tidak tersambung',
  passed: 'Lulus',
  checking: 'Memeriksa…',
};
const rowLabels: Record<ExerciseStatus, string> = {
  todo: 'Belum diisi',
  incorrect: 'Perbaiki',
  dependency: 'Menunggu',
  infrastructure: 'Terputus',
  passed: 'Lulus',
  checking: 'Memeriksa',
};
const contracts: Record<ExerciseId, { input: string; result: string }> = {
  'GEO-01': {
    input: 'Key, ID teknisi, longitude dan latitude',
    result: 'Posisi tersimpan pada index lokasi Redis',
  },
  'GEO-02': {
    input: 'Key lokasi, titik gangguan dan radius km',
    result: 'Teknisi berurutan dari jarak terdekat',
  },
  'KORVET-01': {
    input: 'Producer, topic dan satu event sensor',
    result: 'Record JSON terkirim ke Korvet',
  },
  'KORVET-02': {
    input: 'Consumer, topic dan callback dashboard',
    result: 'Event valid diteruskan setelah konsumsi',
  },
};

export default function WorkshopDrawer({
  state,
  active,
  close,
}: {
  state: Snapshot;
  active?: ExerciseId;
  close: () => void;
}) {
  const [hints, setHints] = useState<Hint[]>([]);
  const [selected, setSelected] = useState<ExerciseId>(active || 'GEO-01');
  const [level, setLevel] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const exercise = state.exercises.find((item) => item.id === selected)!;
  const hint = hints.find((item) => item.id === selected);
  const passed = state.exercises.filter((item) => item.status === 'passed').length;
  const tone =
    exercise.status === 'passed'
      ? 'green'
      : ['incorrect', 'infrastructure'].includes(exercise.status)
        ? 'amber'
        : 'neutral';

  useEffect(() => {
    void request<Hint[]>('/workshop/hints')
      .then(setHints)
      .catch(() => setError('Petunjuk gagal dimuat. Buka docs/workshop.md.'));
    const previousFocus = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary') ||
          [],
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [close]);
  async function action(path: string) {
    setBusy(true);
    setError('');
    try {
      await request(path, 'POST', {});
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyPath() {
    try {
      await navigator.clipboard.writeText(exercise.path);
      setCopied(true);
    } catch {
      setError('Salin path yang ditampilkan lalu buka file di editor.');
    }
  }

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        ref={drawer}
        className="workshop-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Mode workshop"
      >
        <header className="drawer-heading">
          <div>
            <h2>Mode workshop</h2>
            <p>Redis Geospatial & Korvet · 60–90 menit</p>
          </div>
          <button
            ref={closeButton}
            className="icon-button"
            aria-label="Tutup mode workshop"
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className="drawer-content">
          <div className="workshop-progress">
            <strong>{passed} dari 4 latihan selesai</strong>
            <span>Dua file backend</span>
            <div aria-label={`${passed} dari 4 latihan selesai`}>
              {state.exercises.map((item) => (
                <i key={item.id} className={item.status === 'passed' ? 'done' : ''} />
              ))}
            </div>
          </div>
          <nav className="exercise-list" aria-label="Pilih latihan">
            {state.exercises.map((item) => (
              <button
                key={item.id}
                className={`exercise-row ${selected === item.id ? 'active' : ''}`}
                aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setLevel(1);
                  setCopied(false);
                }}
              >
                <span className={`exercise-check ${item.status === 'passed' ? 'done' : ''}`}>
                  {item.status === 'passed' ? <Check size={14} /> : <Circle size={13} />}
                </span>
                <span className="exercise-row-label">
                  <span className="mono">{item.id}</span>
                  <strong>{item.title}</strong>
                </span>
                <span className={`exercise-row-status ${item.status === 'passed' ? 'done' : ''}`}>
                  {rowLabels[item.status]}
                </span>
              </button>
            ))}
          </nav>
          <section className="exercise-detail" aria-label={`Petunjuk ${selected}`}>
            <div className="exercise-detail-heading">
              <h3>{selected}</h3>
              <Badge tone={tone}>{statusLabels[exercise.status]}</Badge>
            </div>
            <div className="exercise-path">
              <code>{exercise.path}</code>
              <button
                className="icon-button"
                aria-label="Salin path file latihan"
                title="Salin path"
                onClick={copyPath}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <dl className="exercise-contract">
              <dt>Input</dt>
              <dd>{contracts[selected].input}</dd>
              <dt>Hasil</dt>
              <dd>{contracts[selected].result}</dd>
            </dl>
            {(exercise.checkedAt || exercise.status !== 'todo') && (
              <p
                className={`exercise-message ${['incorrect', 'infrastructure'].includes(exercise.status) ? 'warning' : ''}`}
              >
                {exercise.message}
                {exercise.checkedAt && <small>Diperiksa {time(exercise.checkedAt)}</small>}
              </p>
            )}
            <div className="hint-tabs" aria-label="Tingkat petunjuk">
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  aria-pressed={level === value}
                  className={level === value ? 'active' : ''}
                  onClick={() => setLevel(value)}
                >
                  Petunjuk {value}
                </button>
              ))}
            </div>
            <div className="hint-content">
              <span>{['Konsep', 'API dan parameter', 'Pseudocode parsial'][level - 1]}</span>
              {level === 3 ? (
                <pre>{hint?.levels[level - 1] || 'Memuat petunjuk…'}</pre>
              ) : (
                <p>{hint?.levels[level - 1] || 'Memuat petunjuk…'}</p>
              )}
            </div>
            <a
              className="text-button"
              href={`/api/docs/workshop.md#${selected.toLowerCase()}`}
              target="_blank"
              rel="noreferrer"
            >
              Baca panduan latihan
              <ExternalLink size={12} />
            </a>
          </section>
          <details className="workshop-tools">
            <summary>
              Infrastruktur lab
              <span>
                <i className={state.infra.redis && state.infra.producer ? 'dot green' : 'dot'} />
                {state.infra.redis && state.infra.producer ? 'Tersambung' : 'Periksa koneksi'}
                <ChevronDown size={14} />
              </span>
            </summary>
            <div className="workshop-tools-body">
              <div>
                <span>Redis</span>
                <Badge tone={state.infra.redis ? 'green' : 'red'}>
                  {state.infra.redis ? 'Tersambung' : 'Terputus'}
                </Badge>
              </div>
              <div>
                <span>Korvet / producer</span>
                <Badge tone={state.infra.producer ? 'green' : 'red'}>
                  {state.infra.producer ? 'Tersambung' : 'Terputus'}
                </Badge>
              </div>
              <dl>
                <dt>Lab ID</dt>
                <dd>{state.labId}</dd>
                <dt>Topic · 1 partition</dt>
                <dd>{state.topic}</dd>
                <dt>Consumer group</dt>
                <dd>{state.groupId}</dd>
              </dl>
              <button
                className="button secondary full"
                disabled={
                  !state.exercises.some(
                    (item) => item.id === 'GEO-01' && item.status === 'passed',
                  ) || busy
                }
                onClick={() => void action('/geo/prepare')}
              >
                Siapkan posisi teknisi
              </button>
              <button
                className="button secondary full"
                disabled={
                  !state.exercises.some(
                    (item) => item.id === 'KORVET-02' && item.status === 'passed',
                  ) || busy
                }
                onClick={() => void action('/consumer/restart')}
              >
                Mulai ulang consumer
              </button>
            </div>
          </details>
        </div>
        <footer className="drawer-footer">
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p>Simpan perubahan di editor, lalu periksa latihan.</p>
          <button
            className="button primary full"
            disabled={state.checking || busy}
            onClick={() => void action('/workshop/validate')}
          >
            <RefreshCw size={15} className={state.checking ? 'spin' : ''} />
            {state.checking || busy ? 'Memeriksa latihan…' : 'Periksa latihan'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
