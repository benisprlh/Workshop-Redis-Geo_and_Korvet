import { config } from './infrastructure/config.js';
import { Runtime } from './operations/runtime.js';
import { createApp } from './http/app.js';

const runtime = new Runtime();
const { app, closeConnections } = createApp(runtime);

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`FieldOps API pada port ${config.port}. Lab ${config.labId}; semua data simulasi.`);
  runtime.start();
});
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  closeConnections();
  server.close();
  const forced = setTimeout(() => process.exit(1), 12000);
  forced.unref();
  await runtime.close();
  clearTimeout(forced);
  process.exit(0);
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
