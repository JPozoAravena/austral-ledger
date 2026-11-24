import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './correlation-id.js';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Ids are logged on every line and echoed back as X-Request-Id.
          genReqId: (req, res) => {
            const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
            res.setHeader('X-Request-Id', id);
            return id;
          },
          // Request bodies are never logged; these cover headers and any future structured fields.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["idempotency-key"]',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.destination',
              'destination',
            ],
            censor: '[Redacted]',
          },
        },
      }),
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService, HttpMetricsMiddleware],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*path');
  }
}
