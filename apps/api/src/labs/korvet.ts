import type { Producer, Consumer } from 'kafkajs';
import {
  type TelemetryEvent,
  type TelemetryHandler,
  parseTelemetry,
  WorkshopTodoError,
} from '../workshop/support.js';

/** KORVET-01: Kirim satu JSON event melalui KafkaJS ke topic Korvet, key = assetId. */
export async function publishTelemetry(
  producer: Producer,
  topic: string,
  event: TelemetryEvent,
): Promise<void> {
  // Isi sekitar 3 baris: producer.send dengan topic, key event.assetId, JSON.stringify(event).
  throw new WorkshopTodoError('KORVET-01');
}

/** KORVET-02: Subscribe dan jalankan satu consumer; teruskan event valid ke callback scaffold. */
export async function consumeTelemetry(
  consumer: Consumer,
  topic: string,
  onEvent: TelemetryHandler,
): Promise<void> {
  // Isi sekitar 8 baris: subscribe({ topic, fromBeginning: true }), lalu run({ eachMessage }).
  // eachMessage menerima message; parseTelemetry(message.value), lalu await onEvent(event) jika valid.
  throw new WorkshopTodoError('KORVET-02');
}
