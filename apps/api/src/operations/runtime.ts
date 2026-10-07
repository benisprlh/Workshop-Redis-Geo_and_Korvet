import { randomUUID } from 'node:crypto';
import type { Consumer } from 'kafkajs';
import { saveTechnicianPosition, findNearbyTechnicians } from '../labs/geo.js';
import { publishTelemetry, consumeTelemetry } from '../labs/korvet.js';
import { config } from '../infrastructure/config.js';
import { Infrastructure, makeConsumer } from '../infrastructure/clients.js';
import { State } from './state.js';
import { resetLabData } from './reset-data.js';
import { Validator } from '../workshop/validator.js';
import { assets } from './fixtures.js';
import { storedEvent } from '../infrastructure/stream-storage.js';
import { ApiError, safeMessage, timeout } from '../shared/errors.js';
import type {
  Position,
  Scenario,
  TelemetryEvent,
  ExerciseId,
  NearbyTechnician,
} from '@fieldops/contracts';

export class Runtime {
  state = new State();
  infra = new Infrastructure(() => {
    Object.assign(this.state.data.infra, {
      redis: this.infra.redisReady,
      korvet: this.infra.korvetReady,
      producer: this.infra.producerReady,
    });
    this.state.emit();
  });
  validator = new Validator(this.state, this.infra);
  private consumer?: Consumer;
  private consumerStarting?: Promise<void>;
  private simulatorTimer?: ReturnType<typeof setTimeout>;
  private tickCount = 0;
  private simulationGeneration = 0;
  private closing = false;
  start(): void {
    this.infra.start();
    this.state.activity(
      'Konsol siap. Metadata 7 aset dan 10 teknisi tersedia sebagai data simulasi.',
    );
  }
  requireExercise(id: ExerciseId): void {
    if (!this.state.passed(id))
      throw new ApiError(
        423,
        `${id} terkunci. Isi apps/api/src/labs/${id.startsWith('GEO') ? 'geo' : 'korvet'}.ts lalu Periksa latihan.`,
      );
  }
  async validate(): Promise<void> {
    await this.validator.run();
    if (this.state.passed('GEO-01')) {
      try {
        await this.loadPositions();
      } catch {
        this.state.data.positionsReady = false;
      }
    }
    if (this.state.passed('KORVET-02'))
      await this.startConsumer().catch(() => {
        this.state.data.infra.consumer = false;
      });
    else await this.stopConsumer();
    this.state.emit();
  }
  // Seed bisnis harus melalui fungsi peserta; tidak ada GEOADD pengganti pada scaffold.
  async loadPositions(): Promise<void> {
    this.requireExercise('GEO-01');
    this.infra.requireRedis();
    const saved = await this.infra.redis.hGetAll(config.positionsKey);
    for (const tech of this.state.data.technicians) {
      const position: Position = saved[tech.id] ? JSON.parse(saved[tech.id]) : tech;
      await saveTechnicianPosition(this.infra.redis, config.geoKey, tech.id, position);
      Object.assign(tech, position, { positionSource: 'redis' });
    }
    this.state.data.positionsReady = true;
    this.state.emit();
  }
  async updatePosition(id: string, position: Position): Promise<void> {
    this.requireExercise('GEO-01');
    this.infra.requireRedis();
    const tech = this.state.data.technicians.find((t) => t.id === id);
    if (!tech) throw new ApiError(404, 'Teknisi tidak ditemukan.');
    await timeout(
      saveTechnicianPosition(this.infra.redis, config.geoKey, id, position),
      config.commandTimeoutMs,
    );
    // Cache metadata hanya diperbarui setelah GEOADD berhasil.
    await this.infra.redis.hSet(config.positionsKey, id, JSON.stringify(position));
    Object.assign(tech, position, { positionSource: 'redis' });
    this.state.activity(`Posisi ${tech.name} diperbarui melalui Redis.`);
  }
  async search(center: Position, radiusKm: number): Promise<NearbyTechnician[]> {
    this.requireExercise('GEO-02');
    this.infra.requireRedis();
    if (!this.state.data.positionsReady)
      throw new ApiError(409, 'Siapkan posisi teknisi dengan GEO-01 terlebih dahulu.');
    const hits = await timeout(
      findNearbyTechnicians(this.infra.redis, config.geoKey, center, radiusKm),
      config.commandTimeoutMs,
    );
    return hits.flatMap((hit) => {
      const tech = this.state.data.technicians.find((t) => t.id === hit.technicianId);
      return tech
        ? [
            {
              ...tech,
              longitude: hit.longitude,
              latitude: hit.latitude,
              distanceKm: hit.distanceKm,
            },
          ]
        : [];
    });
  }
  async publish(event: TelemetryEvent): Promise<void> {
    this.requireExercise('KORVET-01');
    this.infra.requireKorvet();
    await timeout(
      publishTelemetry(this.infra.producer, config.topic, event),
      config.commandTimeoutMs,
    );
    this.state.data.counts.sent += 1;
    this.state.journey(event).sentAt = new Date().toISOString();
    this.state.emit();
    // Ack producer, bukti XLEN/XRANGE, dan callback consumer adalah tahap yang berbeda.
    try {
      this.infra.requireRedis();
      const proof = await timeout(storedEvent(this.infra.redis, config.topic, event.eventId), 3000);
      if (proof) this.state.journey(event).storedAt = new Date().toISOString();
    } catch {
      /* Bukti penyimpanan dapat diperiksa ulang di panel read-only. */
    }
    this.state.emit();
  }
  async startConsumer(): Promise<void> {
    this.requireExercise('KORVET-02');
    this.infra.requireKorvet();
    if (this.consumerStarting) return this.consumerStarting;
    if (this.consumer) return;
    this.consumerStarting = (async () => {
      const client = makeConsumer(config.groupId);
      this.consumer = client;
      client.on(client.events.GROUP_JOIN, () => {
        this.state.data.infra.consumer = true;
        this.state.emit();
      });
      client.on(client.events.CRASH, () => {
        this.state.data.infra.consumer = false;
        this.state.emit();
      });
      client.on(client.events.DISCONNECT, () => {
        this.state.data.infra.consumer = false;
        this.state.emit();
      });
      try {
        await client.connect();
        await consumeTelemetry(client, config.topic, (event) => this.state.received(event));
      } catch (error) {
        await client.disconnect().catch(() => {});
        this.consumer = undefined;
        throw error;
      }
    })().finally(() => {
      this.consumerStarting = undefined;
    });
    await this.consumerStarting;
  }
  async stopConsumer(): Promise<void> {
    await this.consumerStarting?.catch(() => {});
    const consumer = this.consumer;
    this.consumer = undefined;
    if (consumer) await consumer.disconnect().catch(() => {});
    this.state.data.infra.consumer = false;
    this.state.emit();
  }
  async restartConsumer(): Promise<void> {
    await this.stopConsumer();
    await this.startConsumer();
    this.state.activity(
      'Consumer dashboard dimulai ulang. eventId mencegah tampilan ganda dalam sesi ini.',
    );
  }
  startSimulator(assetId: string, scenario: Scenario): void {
    this.requireExercise('KORVET-01');
    this.infra.requireKorvet();
    if (!assets.some((a) => a.id === assetId)) throw new ApiError(404, 'Aset tidak ditemukan.');
    this.stopSimulator();
    this.tickCount = 0;
    Object.assign(this.state.data.simulator, {
      running: true,
      assetId,
      scenario,
      error: undefined,
    });
    this.state.activity(
      `Simulasi ${assetId} dimulai (${scenario === 'normal' ? 'Normal' : scenario === 'temperature' ? 'Temperatur meningkat' : 'Tegangan turun'}).`,
    );
    const generation = this.simulationGeneration;
    this.simulatorTimer = setTimeout(() => {
      void this.tick(generation);
    }, 100);
  }
  private async tick(generation: number): Promise<void> {
    if (
      this.closing ||
      !this.state.data.simulator.running ||
      generation !== this.simulationGeneration
    )
      return;
    const { assetId, scenario, intervalMs } = this.state.data.simulator;
    this.tickCount += 1;
    const wave = Math.sin(this.tickCount / 2) * 1.7;
    const round = (n: number) => Math.round(n * 10) / 10;
    const event: TelemetryEvent = {
      eventId: randomUUID(),
      assetId,
      timestamp: new Date().toISOString(),
      temperatureC: round(
        scenario === 'temperature' ? Math.min(95, 72 + this.tickCount * 2) + wave : 64 + wave,
      ),
      voltageV: round(
        scenario === 'voltage' ? Math.max(192, 222 - this.tickCount * 5) + wave : 228 + wave,
      ),
      currentA: round(18.4 + wave / 3),
    };
    try {
      await this.publish(event);
    } catch (error) {
      this.stopSimulator();
      this.state.data.simulator.error = safeMessage(error);
      this.state.activity(
        'Simulator dihentikan karena event gagal dikirim. Periksa koneksi lab.',
        'warning',
      );
    }
    if (this.state.data.simulator.running && generation === this.simulationGeneration)
      this.simulatorTimer = setTimeout(() => {
        void this.tick(generation);
      }, intervalMs);
  }
  stopSimulator(): void {
    this.simulationGeneration += 1;
    clearTimeout(this.simulatorTimer);
    this.state.data.simulator.running = false;
    this.state.emit();
  }
  async resetData(confirm: string): Promise<void> {
    if (this.state.data.checking)
      throw new ApiError(409, 'Tunggu pemeriksaan selesai sebelum reset data.');
    this.stopSimulator();
    await this.stopConsumer();
    await resetLabData(confirm);
    this.state.clearData();
    this.state.activity(
      'Data namespace lab direset. Kode latihan tidak berubah. Siapkan posisi dan mulai consumer kembali lewat mode workshop.',
    );
  }
  async close(): Promise<void> {
    this.closing = true;
    this.stopSimulator();
    await this.stopConsumer();
    await this.infra.close();
  }
}
