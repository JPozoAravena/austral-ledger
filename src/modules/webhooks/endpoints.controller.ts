import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { uuidParam } from '../accounts/accounts.schemas.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
import type { EndpointRecord } from './endpoints.repository.js';
import { createEndpointBody, type CreateEndpointBody } from './endpoints.schemas.js';
import { EndpointsService } from './endpoints.service.js';

const toEndpointResponse = (endpoint: EndpointRecord) => ({
  id: endpoint.id,
  url: endpoint.url,
  active: endpoint.active,
  createdAt: endpoint.createdAt.toISOString(),
});

@ApiTags('webhooks')
@Controller('v1/webhook-endpoints')
export class EndpointsController {
  constructor(private readonly endpoints: EndpointsService) {}

  @Post()
  @Scopes('platform')
  @ApiZodBody(createEndpointBody)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createEndpointBody)) body: CreateEndpointBody,
  ) {
    const { endpoint, secret } = await this.endpoints.create(principal, body.url);
    return { ...toEndpointResponse(endpoint), secret };
  }

  @Get()
  @Scopes('platform')
  async list(@CurrentPrincipal() principal: Principal) {
    return { items: (await this.endpoints.list(principal)).map(toEndpointResponse) };
  }

  @Delete(':id')
  @HttpCode(204)
  @Scopes('platform')
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
  ): Promise<void> {
    await this.endpoints.deactivate(principal, id);
  }
}
