import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiError } from './api-error.js';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    // Issue messages only; never echo the submitted values.
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
}
