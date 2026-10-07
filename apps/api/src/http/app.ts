import express from 'express';
import { ZodError, z } from 'zod';
import { config } from '../infrastructure/config.js';
import type { Runtime } from '../operations/runtime.js';
import { coordinatesSchema, telemetrySchema } from '../workshop/support.js';
import { assets } from '../operations/fixtures.js';
import { hints } from '../workshop/hints.js';
import { inspectStream } from '../infrastructure/stream-storage.js';
import { ApiError, InfrastructureError, safeMessage, timeout } from '../shared/errors.js';
import { registerGuides } from './guides.js';

export function createApp(runtime: Runtime) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '24kb' }));
  const wrap =
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ...runtime.state.data.infra }));
  app.get('/api/state', (_req, res) => res.json(runtime.state.snapshot()));
  app.get('/api/workshop/hints', (_req, res) => res.json(hints));
  registerGuides(app);
  app.post(
    '/api/workshop/validate',
    wrap(async (_req, res) => {
      if (runtime.state.data.checking) throw new ApiError(409, 'Pemeriksaan masih berjalan.');
      await runtime.validate();
      res.json(runtime.state.snapshot());
    }),
  );
  app.post(
    '/api/geo/prepare',
    wrap(async (_req, res) => {
      await timeout(runtime.loadPositions(), 8000);
      res.json(runtime.state.snapshot());
    }),
  );
  app.put(
    '/api/technicians/:id/position',
    wrap(async (req, res) => {
      const position = coordinatesSchema.strict().parse(req.body);
      await runtime.updatePosition(req.params.id, position);
      res.json(runtime.state.snapshot());
    }),
  );
  app.post(
    '/api/geo/search',
    wrap(async (req, res) => {
      const input = z
        .object({ center: coordinatesSchema.strict(), radiusKm: z.number().min(0.1).max(50) })
        .strict()
        .parse(req.body);
      res.json({
        results: await runtime.search(input.center, input.radiusKm),
        source: 'Redis GEOSEARCH',
      });
    }),
  );
  app.post(
    '/api/simulator/start',
    wrap((req, res) => {
      const input = z
        .object({ assetId: z.string(), scenario: z.enum(['normal', 'temperature', 'voltage']) })
        .strict()
        .parse(req.body);
      runtime.startSimulator(input.assetId, input.scenario);
      res.json(runtime.state.snapshot());
    }),
  );
  app.post('/api/simulator/stop', (_req, res) => {
    runtime.stopSimulator();
    res.json(runtime.state.snapshot());
  });
  app.post(
    '/api/telemetry',
    wrap(async (req, res) => {
      const event = telemetrySchema.parse(req.body);
      if (!assets.some((a) => a.id === event.assetId))
        throw new ApiError(400, 'Gunakan ID aset yang tersedia.');
      await runtime.publish(event);
      res.status(202).json({
        eventId: event.eventId,
        sent: true,
        note: 'Status diterima hanya muncul dari callback consumer.',
      });
    }),
  );
  app.post(
    '/api/consumer/restart',
    wrap(async (_req, res) => {
      if (runtime.state.data.checking) throw new ApiError(409, 'Tunggu pemeriksaan selesai.');
      await timeout(runtime.restartConsumer(), 10000);
      res.json(runtime.state.snapshot());
    }),
  );
  app.post(
    '/api/data/reset',
    wrap(async (req, res) => {
      const input = z.object({ confirm: z.literal(config.labId) }).parse(req.body);
      await runtime.resetData(input.confirm);
      res.json(runtime.state.snapshot());
    }),
  );
  app.get(
    '/api/storage',
    wrap(async (_req, res) => {
      runtime.infra.requireRedis();
      res.json(await timeout(inspectStream(runtime.infra.redis), 5000));
    }),
  );

  // Satu consumer backend; browser hanya membuka SSE snapshot. Tidak ada consumer per tab.
  const browsers = new Set<express.Response>();
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    browsers.add(res);
    const send = () => {
      if (!res.destroyed)
        res.write(`event: snapshot\ndata: ${JSON.stringify(runtime.state.snapshot())}\n\n`);
    };
    send();
    runtime.state.bus.on('change', send);
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(': heartbeat\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      browsers.delete(res);
      runtime.state.bus.off('change', send);
    });
  });
  runtime.state.bus.setMaxListeners(100);
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        error instanceof ZodError
          ? 400
          : error instanceof ApiError
            ? error.status
            : error instanceof InfrastructureError
              ? 503
              : error instanceof SyntaxError
                ? 400
                : 500;
      res.status(status).json({
        error:
          error instanceof ZodError
            ? 'Input tidak valid. Longitude −180…180; latitude −85.05112878…85.05112878. Periksa field dan tipe angka.'
            : safeMessage(error),
      });
    },
  );

  return { app, closeConnections: () => browsers.forEach((res) => res.end()) };
}
