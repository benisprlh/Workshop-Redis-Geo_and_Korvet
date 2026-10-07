import type { Producer, Consumer } from 'kafkajs';
import {
  type TelemetryEvent,
  type TelemetryHandler,
  parseTelemetry,
  WorkshopTodoError,
} from '../workshop/support.js';

/** KORVET-01: KafkaJS mengirim ke Korvet; Korvet sendiri menulis Redis Streams. */
export async function publishTelemetry(
  producer: Producer,
  topic: string,
  event: TelemetryEvent,
): Promise<void> {
  await producer.send({
    topic,
    messages: [{ key: event.assetId, value: JSON.stringify(event) }],
  });
}

/** KORVET-02: run menyalakan loop consumer; callback hanya dipanggil setelah fetch Korvet. */
export async function consumeTelemetry(
  consumer: Consumer,
  topic: string,
  onEvent: TelemetryHandler,
): Promise<void> {
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = parseTelemetry(message.value);
      if (event) await onEvent(event);
    },
  });
}
