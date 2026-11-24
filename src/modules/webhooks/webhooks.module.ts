import { Module } from '@nestjs/common';
import { EndpointsController } from './endpoints.controller.js';
import { EndpointsService } from './endpoints.service.js';
import { WebhookCoreModule } from './webhook-core.module.js';

@Module({
  imports: [WebhookCoreModule],
  controllers: [EndpointsController],
  providers: [EndpointsService],
})
export class WebhooksModule {}
