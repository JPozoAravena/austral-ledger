import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { SkipRateLimit } from '../rate-limit/skip-rate-limit.js';
import { MetricsService } from './metrics.service.js';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Public for scrapers; in production this endpoint would live on an internal network only.
  @Public()
  @SkipRateLimit()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.render();
  }
}
