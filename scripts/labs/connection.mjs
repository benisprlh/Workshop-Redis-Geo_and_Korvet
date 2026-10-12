const base = process.env.API_URL || 'http://localhost:3001';
const response = await fetch(`${base}/api/workshop/redis/check`, {
  method: 'POST',
  signal: AbortSignal.timeout(30000),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
const connection = result.redisConnection;
console.log(`Koneksi Redis: ${connection.status} — ${connection.message}`);
console.log(
  `Endpoint: ${connection.endpoint.host}:${connection.endpoint.port}; TLS: ${connection.endpoint.tls ? 'ya' : 'tidak'}`,
);
if (connection.status !== 'passed') process.exitCode = 1;
