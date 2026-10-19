/** Dibaca ulang bersama REDIS_URL ketika peserta menekan pemeriksaan koneksi. */
export function readKafkaSettings(environment: NodeJS.ProcessEnv) {
  const brokers = (environment.KAFKA_BROKERS ?? 'localhost:9092')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const namespace = environment.KORVET_NAMESPACE || 'korvet';
  let kafkaIssue: string | undefined;
  if (
    !brokers.length ||
    brokers.some((broker) => {
      const match = /^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9._-]+):(\d+)$/.exec(broker);
      return !match || Number(match[2]) < 1 || Number(match[2]) > 65535;
    })
  )
    kafkaIssue =
      'KAFKA_BROKERS harus berisi host:port Korvet, dipisahkan koma jika lebih dari satu.';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(namespace))
    kafkaIssue =
      'KORVET_NAMESPACE harus berupa nama sederhana dengan huruf, angka, tanda hubung, atau underscore.';
  if (Boolean(environment.KAFKA_USERNAME) !== Boolean(environment.KAFKA_PASSWORD))
    kafkaIssue = 'Isi KAFKA_USERNAME dan KAFKA_PASSWORD berpasangan sesuai endpoint Korvet.';
  if (environment.KAFKA_SSL && !['true', 'false'].includes(environment.KAFKA_SSL))
    kafkaIssue = 'KAFKA_SSL harus true atau false.';
  return {
    brokers,
    namespace,
    kafkaIssue,
    ssl: environment.KAFKA_SSL === 'true',
    sasl:
      environment.KAFKA_USERNAME && environment.KAFKA_PASSWORD
        ? {
            mechanism: 'plain' as const,
            username: environment.KAFKA_USERNAME,
            password: environment.KAFKA_PASSWORD,
          }
        : undefined,
  };
}
