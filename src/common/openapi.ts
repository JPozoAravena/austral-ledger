import type { INestApplication } from '@nestjs/common';
import { ApiBody, type ApiBodyOptions, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';

type BodySchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];

// The openapi-3.0 target never emits boolean schemas, so any object result is a valid OpenAPI schema.
function isSchemaObject(value: unknown): value is BodySchema {
  return typeof value === 'object' && value !== null;
}

/** Documents a request body from the same zod schema used to validate it. */
export function ApiZodBody(schema: z.ZodType): MethodDecorator {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
  if (!isSchemaObject(json)) throw new Error('Unsupported zod schema for OpenAPI');
  return ApiBody({ schema: json });
}

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Austral Ledger')
    .setDescription('Double-entry wallet ledger API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
