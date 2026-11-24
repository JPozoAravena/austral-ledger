import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(app.get<Env>(ENV).PORT, '0.0.0.0');
