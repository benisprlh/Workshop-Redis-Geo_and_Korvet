export type ExerciseId = 'GEO-01' | 'GEO-02' | 'KORVET-01' | 'KORVET-02';
export type ExerciseStatus =
  | 'todo'
  | 'incorrect'
  | 'dependency'
  | 'infrastructure'
  | 'passed'
  | 'checking';
export interface Position {
  longitude: number;
  latitude: number;
}
export interface Asset extends Position {
  id: string;
  name: string;
  area: string;
  type: string;
}
export interface Technician extends Position {
  id: string;
  name: string;
  skills: string[];
  area: string;
  status: 'available' | 'busy';
  positionSource: 'preview' | 'redis';
}
export interface NearbyTechnician extends Technician {
  distanceKm: number;
}
export interface TelemetryEvent {
  eventId: string;
  assetId: string;
  timestamp: string;
  temperatureC: number;
  voltageV: number;
  currentA: number;
}
export interface Exercise {
  id: ExerciseId;
  title: string;
  path: string;
  status: ExerciseStatus;
  message: string;
  checkedAt?: string;
}
export interface Hint {
  id: ExerciseId;
  title: string;
  levels: string[];
}
export interface Alarm {
  eventId: string;
  assetId: string;
  timestamp: string;
  kind: 'temperature' | 'voltage';
  value: number;
  message: string;
}
export interface Activity {
  id: string;
  timestamp: string;
  message: string;
  kind: 'info' | 'warning';
}
export interface Journey {
  eventId: string;
  assetId: string;
  sentAt?: string;
  storedAt?: string;
  receivedAt?: string;
}
export type Scenario = 'normal' | 'temperature' | 'voltage';
export interface Snapshot {
  labId: string;
  topic: string;
  groupId: string;
  assets: Asset[];
  technicians: Technician[];
  exercises: Exercise[];
  infra: { redis: boolean; korvet: boolean; producer: boolean; consumer: boolean; sse?: boolean };
  simulator: {
    running: boolean;
    assetId: string;
    scenario: Scenario;
    intervalMs: number;
    error?: string;
  };
  events: TelemetryEvent[];
  alarms: Alarm[];
  activities: Activity[];
  journeys: Journey[];
  counts: { sent: number; received: number };
  thresholds: { temperatureC: number; voltageV: number };
  positionsReady: boolean;
  checking: boolean;
  serverTime: string;
}
export interface StorageEntry {
  id: string;
  streamKey?: string;
  key?: string;
  timestamp?: string;
  event?: TelemetryEvent;
  fields: Record<string, string>;
}
export interface StorageSnapshot {
  streamKey: string;
  length: number;
  streams: { key: string; length: number }[];
  entries: StorageEntry[];
  checkedAt: string;
}
