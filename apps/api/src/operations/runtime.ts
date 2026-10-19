import { randomUUID } from 'node:crypto';
import type { Consumer } from 'kafkajs';
import { saveTechnicianPosition, findNearbyTechnicians } from '../labs/geo.js';
import { publishTelemetry, consumeTelemetry } from '../labs/korvet.js';
import { config } from '../infrastructure/config.js';
import {
  readRedisEnvironment,
  readWorkshopEnvironment,
} from '../infrastructure/redis-environment.js';
import { readKafkaSettings } from '../infrastructure/kafka-settings.js';
import { initialKorvetConnection } from '../workshop/korvet-connection.js';
import { Infrastructure, makeConsumer } from '../infrastructure/clients.js';
import { State } from './state.js';
import { resetLabData } from './reset-data.js';
import { Validator } from '../workshop/validator.js';
import { checkRedisConnection, initialRedisConnection } from '../workshop/redis-connection.js';
import { assets } from './fixtures.js';
import { storedEvent } from '../infrastructure/stream-storage.js';
import { ApiError, InfrastructureError, safeMessage, timeout } from '../shared/errors.js';
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
    if (!this.infra.redisReady && this.state.data.redisConnection.status === 'passed') {
      this.state.data.redisConnection.status = 'failed';
      this.state.data.redisConnection.message =
        'Koneksi Redis terputus. Pulihkan endpoint lalu periksa koneksi kembali.';
      this.stopSimulator();
      void this.stopConsumer();
    }
    this.state.emit();
  });
  validator = new Validator(this.state, this.infra);
  private consumer?: Consumer;
  private consumerStarting?: Promise<void>;
  private consumerStopping?: Promise<void>;
  private simulatorTimer?: ReturnType<typeof setTimeout>;
  private tickCount = 0;
  private simulationGeneration = 0;
  private closing = false;
  private checkingConnection = false;
  private connectionGeneration = 0;
  start(): void {
    this.infra.start();
    this.state.activity(
      'Konsol siap. Metadata 7 aset dan 10 teknisi tersedia sebagai data simulasi.',
    );
  }
  requireExercise(id: ExerciseId): void {
    this.requireRedisConnection();
    if (!this.state.passed(id))
      throw new ApiError(
        423,
        `${id} terkunci. Isi apps/api/src/labs/${id.startsWith('GEO') ? 'geo' : 'korvet'}.ts lalu Periksa latihan.`,
      );
  }
  requireRedisConnection(): void {
    if (this.state.data.redisConnection.status === 'local')
      throw new ApiError(423, this.state.data.redisConnection.message);
    if (this.state.data.redisConnection.status === 'failed')
      throw new InfrastructureError(this.state.data.redisConnection.message);
    if (this.state.data.redisConnection.status !== 'passed')
      throw new ApiError(
        423,
        'Selesaikan persiapan Koneksi Redis pada Mode workshop sebelum melanjutkan latihan.',
      );
    this.infra.requireRedis();
  }
  async checkConnection(): Promise<void> {
    if (this.state.data.checking || this.checkingConnection)
      throw new ApiError(409, 'Tunggu pemeriksaan yang sedang berjalan.');
    this.checkingConnection = true;
    this.stopSimulator();
    this.state.data.redisConnection.status = 'checking';
    this.state.emit();
    try {
      const environment = readWorkshopEnvironment();
      const settings = readRedisEnvironment(environment);
      const kafka = readKafkaSettings(environment.values);
      const oldKafka = {
        brokers: config.brokers,
        namespace: config.namespace,
        kafkaIssue: config.kafkaIssue,
        ssl: config.ssl,
        sasl: config.sasl,
      };
      if (
        JSON.stringify(settings) !== JSON.stringify(config.redis) ||
        JSON.stringify(kafka) !== JSON.stringify(oldKafka)
      ) {
        this.connectionGeneration += 1;
        this.stopSimulator();
        await this.stopConsumer();
        await this.infra.resetRedis();
        config.redis = settings;
        Object.assign(config, kafka);
        this.state.clearData();
        delete this.state.data.simulator.error;
        for (const exercise of this.state.data.exercises) {
          exercise.status = 'dependency';
          exercise.message = 'Koneksi lab berubah. Periksa latihan kembali pada endpoint ini.';
          delete exercise.checkedAt;
        }
      }
      this.state.data.redisConnection = { ...initialRedisConnection(), status: 'checking' };
      this.state.emit();
      const connection = await checkRedisConnection();
      if (connection.status === 'passed') {
        try {
          await this.infra.connectRedis();
        } catch {
          connection.status = 'failed';
          connection.message =
            'Koneksi utama Redis belum siap. Periksa endpoint dan jaringan, lalu periksa koneksi kembali.';
        }
      }
      if (connection.status === 'passed') {
        this.state.data.redisConnection.korvet = initialKorvetConnection();
        this.state.emit();
        connection.korvet = await this.infra.enableStreaming();
        if (connection.korvet.status === 'passed')
          this.state.activity(
            'Redis dan penyimpanan Korvet terverifikasi. Empat latihan siap diperiksa.',
          );
        else {
          this.stopSimulator();
          await this.stopConsumer();
          for (const exercise of this.state.data.exercises.filter((e) =>
            e.id.startsWith('KORVET'),
          )) {
            exercise.status = 'infrastructure';
            exercise.message = connection.korvet.message;
          }
          this.state.activity(
            'Redis terverifikasi. Koneksi atau penyimpanan Korvet perlu diperiksa.',
            'warning',
          );
        }
      } else {
        this.stopSimulator();
        await this.stopConsumer();
        await this.infra.resetRedis();
      }
      this.state.data.redisConnection = connection;
    } catch {
      this.state.data.redisConnection = {
        ...initialRedisConnection(),
        status: 'failed',
        checkedAt: new Date().toISOString(),
        message: 'Koneksi belum dapat diperbarui. Periksa .env dan jaringan, lalu periksa kembali.',
      };
    } finally {
      this.checkingConnection = false;
      this.state.emit();
    }
  }

  async validate(): Promise<void> {
    if (this.state.data.redisConnection.status !== 'passed') {
      const disconnected = this.state.data.redisConnection.status === 'failed';
      for (const exercise of this.state.data.exercises) {
        exercise.status = disconnected ? 'infrastructure' : 'dependency';
        exercise.message =
          this.state.data.redisConnection.status === 'local'
            ? this.state.data.redisConnection.message
            : 'Selesaikan persiapan Koneksi Redis pada .env, lalu tekan Periksa koneksi Redis.';
      }
      this.state.emit();
      return;
    }
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
    const generation = this.connectionGeneration;
    await timeout(
      publishTelemetry(this.infra.producer, config.topic, event),
      config.commandTimeoutMs,
    );
    if (generation !== this.connectionGeneration) return;
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
    await this.consumerStopping;
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
    if (this.consumerStopping) return this.consumerStopping;
    this.consumerStopping = (async () => {
      await this.consumerStarting?.catch(() => {});
      const consumer = this.consumer;
      if (consumer) await consumer.disconnect().catch(() => {});
      this.consumer = undefined;
      this.state.data.infra.consumer = false;
      this.state.emit();
    })().finally(() => {
      this.consumerStopping = undefined;
    });
    return this.consumerStopping;
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
