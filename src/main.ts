import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';

const env = parseEnv(process.env);
const app = await NestFactory.create(AppModule);
await app.listen(env.PORT, '0.0.0.0');
