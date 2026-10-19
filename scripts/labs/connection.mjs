const base = process.env.API_URL || 'http://localhost:3001';
const response = await fetch(`${base}/api/workshop/redis/check`, {
  method: 'POST',
  signal: AbortSignal.timeout(120000),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
const connection = result.redisConnection;
console.log(`Koneksi Redis: ${connection.status} — ${connection.message}`);
console.log(
  `Endpoint: ${connection.endpoint.host}:${connection.endpoint.port}; TLS: ${connection.endpoint.tls ? 'ya' : 'tidak'}`,
);
if (connection.korvet)
  console.log(`Penyimpanan Korvet: ${connection.korvet.status} — ${connection.korvet.message}`);
if (connection.status !== 'passed' || connection.korvet?.status === 'failed') process.exitCode = 1;
