import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { SkipRateLimit } from '../rate-limit/skip-rate-limit.js';

@Controller('health')
export class HealthController {
  @Public()
  @SkipRateLimit()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
