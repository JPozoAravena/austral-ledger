import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { LedgerError } from '../domain/ledger/errors.js';
import { ApiError } from './api-error.js';

interface ResponseLike {
  status(code: number): { json(body: unknown): void };
}

interface ErrorBody {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof ApiError) {
    return { status: exception.status, code: exception.code, message: exception.message };
  }
  if (exception instanceof LedgerError) {
    return { status: 422, code: exception.code, message: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      message: exception.message,
    };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Maps every error to `{ error: { code, message } }`. Internals (stack, SQL, params) never leave the process. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, code, message } = toErrorBody(exception);
    if (status >= 500) {
      // Class name only: driver errors can embed query parameters (e.g. payout destinations).
      this.logger.error(`Unhandled ${exception instanceof Error ? exception.name : 'error'}`);
    }
    host
      .switchToHttp()
      .getResponse<ResponseLike>()
      .status(status)
      .json({ error: { code, message } });
  }
}
