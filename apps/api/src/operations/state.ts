import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { assets, technicians } from './fixtures.js';
import { config } from '../infrastructure/config.js';
import type { Snapshot, ExerciseId, Exercise, TelemetryEvent, Journey } from '@fieldops/contracts';

const titles = [
  'Simpan posisi teknisi',
  'Cari dalam radius',
  'Kirim event ke Korvet',
  'Terima event dari Korvet',
];
const ids: ExerciseId[] = ['GEO-01', 'GEO-02', 'KORVET-01', 'KORVET-02'];
export class State {
  bus = new EventEmitter();
  data: Snapshot = {
    labId: config.labId,
    topic: config.topic,
    groupId: config.groupId,
    assets,
    technicians: structuredClone(technicians),
    exercises: ids.map((id, i) => ({
      id,
      title: titles[i],
      path: `apps/api/src/labs/${i < 2 ? 'geo' : 'korvet'}.ts`,
      status: 'todo',
      message: 'Belum diisi. Buka petunjuk dan isi fungsi latihan.',
    })),
    infra: { redis: false, korvet: false, producer: false, consumer: false },
    simulator: { running: false, assetId: assets[0].id, scenario: 'normal', intervalMs: 2500 },
    thresholds: { temperatureC: 80, voltageV: 210 },
    events: [],
    alarms: [],
    activities: [],
    journeys: [],
    counts: { sent: 0, received: 0 },
    positionsReady: false,
    checking: false,
    serverTime: new Date().toISOString(),
  };
  private seen = new Set<string>();
  clearData(): void {
    this.seen.clear();
    this.data.events = [];
    this.data.alarms = [];
    this.data.journeys = [];
    this.data.counts = { sent: 0, received: 0 };
    this.data.technicians = structuredClone(technicians);
    this.data.positionsReady = false;
    this.emit();
  }
  snapshot(): Snapshot {
    return { ...this.data, serverTime: new Date().toISOString() };
  }
  emit(): void {
    this.bus.emit('change', this.snapshot());
  }
  exercise(id: ExerciseId): Exercise {
    return this.data.exercises.find((e) => e.id === id)!;
  }
  passed(id: ExerciseId): boolean {
    return this.exercise(id).status === 'passed';
  }
  activity(message: string, kind: 'info' | 'warning' = 'info'): void {
    this.data.activities.unshift({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      message,
      kind,
    });
    this.data.activities = this.data.activities.slice(0, 30);
    this.emit();
  }
  journey(event: TelemetryEvent): Journey {
    let row = this.data.journeys.find((j) => j.eventId === event.eventId);
    if (!row) {
      row = { eventId: event.eventId, assetId: event.assetId };
      this.data.journeys.unshift(row);
      this.data.journeys = this.data.journeys.slice(0, 40);
    }
    return row;
  }
  // Hanya callback consumer yang memperbarui data live; producer tidak memanggilnya.
  async received(event: TelemetryEvent): Promise<void> {
    if (this.seen.has(event.eventId) || !assets.some((a) => a.id === event.assetId)) return;
    this.seen.add(event.eventId);
    if (this.seen.size > 4000) this.seen.delete(this.seen.values().next().value!);
    this.data.events.push(event);
    this.data.events = this.data.events.slice(-160);
    this.data.counts.received += 1;
    this.journey(event).receivedAt = new Date().toISOString();
    const alarmBase = {
      eventId: event.eventId,
      assetId: event.assetId,
      timestamp: event.timestamp,
    };
    if (event.temperatureC > this.data.thresholds.temperatureC)
      this.data.alarms.unshift({
        ...alarmBase,
        kind: 'temperature',
        value: event.temperatureC,
        message: `Temperatur ${event.temperatureC.toFixed(1)} °C melewati 80 °C`,
      });
    if (event.voltageV < this.data.thresholds.voltageV)
      this.data.alarms.unshift({
        ...alarmBase,
        kind: 'voltage',
        value: event.voltageV,
        message: `Tegangan ${event.voltageV.toFixed(1)} V di bawah 210 V`,
      });
    this.data.alarms = this.data.alarms.slice(0, 24);
    this.emit();
  }
}
