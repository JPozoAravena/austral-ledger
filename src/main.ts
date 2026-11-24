import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './common/openapi.js';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
const env = app.get<Env>(ENV);
if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
setupOpenApi(app);
await app.listen(env.PORT, '0.0.0.0');
