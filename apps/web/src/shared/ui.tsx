import { LockKeyhole, ArrowUpRight, Inbox } from 'lucide-react';
import type { ExerciseId } from '@fieldops/contracts';
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Locked({
  id,
  open,
  compact = false,
}: {
  id: ExerciseId;
  open: (id?: ExerciseId) => void;
  compact?: boolean;
}) {
  return (
    <div className={`locked ${compact ? 'compact' : ''}`}>
      <LockKeyhole size={17} />
      <div>
        <strong>
          Fitur belum aktif <span className="mono">{id}</span>
        </strong>
        <p>{`Isi apps/api/src/labs/${id.startsWith('GEO') ? 'geo' : 'korvet'}.ts lalu periksa latihan.`}</p>
        <button className="text-button" onClick={() => open(id)}>
          Buka petunjuk <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty">
      <Inbox size={24} />
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
