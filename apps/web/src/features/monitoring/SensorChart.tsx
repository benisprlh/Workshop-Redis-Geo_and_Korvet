import { useEffect, useRef, useState } from 'react';
import type { TelemetryEvent } from '@fieldops/contracts';
import { number, time } from '../../shared/api';
export default function SensorChart({
  events,
  metric,
  threshold,
  title,
  unit,
}: {
  events: TelemetryEvent[];
  metric: 'temperatureC' | 'voltageV';
  threshold: number;
  title: string;
  unit: string;
}) {
  const [hover, setHover] = useState<number | undefined>();
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(540);
  useEffect(() => {
    if (!area.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, Math.round(entry.contentRect.width))),
    );
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  const data = events.slice(-30);
  const W = width,
    H = 182,
    left = 46,
    right = 12,
    top = 18,
    bottom = 32;
  const minDefault = metric === 'temperatureC' ? 50 : 180,
    maxDefault = metric === 'temperatureC' ? 100 : 250;
  const min = Math.floor(Math.min(minDefault, ...data.map((e) => e[metric])) / 10) * 10;
  const max = Math.ceil(Math.max(maxDefault, ...data.map((e) => e[metric])) / 10) * 10;
  const start = data.length ? new Date(data[0].timestamp).getTime() : 0;
  const end = data.length > 1 ? new Date(data[data.length - 1].timestamp).getTime() : start + 2500;
  const x = (i: number) =>
    left +
    (data.length > 1
      ? (new Date(data[i].timestamp).getTime() - start) / Math.max(1, end - start)
      : 0) *
      (W - left - right);
  const y = (value: number) => top + ((max - value) / (max - min)) * (H - top - bottom);
  const color = metric === 'temperatureC' ? '#2563eb' : '#475569';
  const latest = data.at(-1);
  const index = hover === undefined ? undefined : Math.max(0, Math.min(data.length - 1, hover));
  const active = index === undefined ? undefined : data[index];
  return (
    <section className="chart-panel">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <span className="chart-legend">
            <i style={{ background: color }} />
            {unit}
            <span className="threshold-key" />
            Ambang {threshold} {unit}
          </span>
        </div>
        <strong className="chart-value">
          {latest ? number(latest[metric]) : '—'}
          <small>{unit}</small>
        </strong>
      </div>
      <div ref={area} className="chart-area" onMouseLeave={() => setHover(undefined)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}, satuan ${unit}. ${data.length} event dari consumer.`}
          onMouseMove={(event) => {
            if (!data.length) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const position = ((event.clientX - rect.left) / rect.width) * W;
            setHover(
              data.reduce(
                (best, _, i) =>
                  Math.abs(x(i) - position) < Math.abs(x(best) - position) ? i : best,
                0,
              ),
            );
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const value = min + ((max - min) * i) / 4;
            return (
              <g key={i}>
                <line x1={left} x2={W - right} y1={y(value)} y2={y(value)} stroke="#e9edf2" />
                <text x={left - 10} y={y(value) + 4} textAnchor="end" className="axis-text">
                  {value.toLocaleString('id-ID')}
                </text>
              </g>
            );
          })}
          <line
            x1={left}
            x2={W - right}
            y1={y(threshold)}
            y2={y(threshold)}
            stroke="#c68e32"
            strokeDasharray="5 5"
          />
          {data.length > 0 && (
            <>
              <polyline
                points={data.map((e, i) => `${x(i)},${y(e[metric])}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {data.length === 1 && <circle cx={x(0)} cy={y(data[0][metric])} r="3" fill={color} />}
            </>
          )}
          {data.length > 0 &&
            [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].map((i) => (
              <text
                key={i}
                x={x(i)}
                y={H - 14}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                className="axis-text"
              >
                {time(data[i].timestamp)}
              </text>
            ))}
          {!data.length && (
            <text x={W / 2} y={H - 14} textAnchor="middle" className="axis-text">
              Waktu event
            </text>
          )}
          {active && index !== undefined && (
            <>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={top}
                y2={H - bottom}
                stroke="#a6b3c3"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(index)}
                cy={y(active[metric])}
                r="4"
                fill={color}
                stroke="white"
                strokeWidth="2"
              />
            </>
          )}
        </svg>
        {!data.length && <div className="chart-empty">Menunggu event dari consumer</div>}
        {active && (
          <div className="chart-tooltip">
            {time(active.timestamp)}{' '}
            <strong>
              {number(active[metric])} {unit}
            </strong>
          </div>
        )}
      </div>
    </section>
  );
}
