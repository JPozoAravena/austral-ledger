import 'reflect-metadata';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { MetricsService } from './modules/observability/metrics.service.js';
import { WorkerModule } from './worker.module.js';

const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();

// The worker has no API, so Prometheus scrapes this tiny endpoint (also used by the container healthcheck).
const metrics = app.get(MetricsService);
const server = createServer((req, res) => {
  if (req.url !== '/metrics') {
    res.writeHead(404).end();
    return;
  }
  metrics.render().then(
    (text) => res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' }).end(text),
    () => res.writeHead(500).end(),
  );
});
server.listen(app.get<Env>(ENV).WORKER_METRICS_PORT, '0.0.0.0');
