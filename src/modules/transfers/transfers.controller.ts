import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
import { FundingsService } from './fundings.service.js';
import {
  fundingBody,
  type FundingBody,
  transferBody,
  type TransferBody,
} from './transfers.schemas.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('transfers')
@Controller('v1')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly fundings: FundingsService,
  ) {}

  @Post('transfers')
  @Scopes('platform', 'user')
  @ApiZodBody(transferBody)
  transfer(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(transferBody)) body: TransferBody,
  ) {
    return this.transfers.transfer(principal, body);
  }

  @Post('fundings')
  @Scopes('platform')
  @ApiZodBody(fundingBody)
  fund(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(fundingBody)) body: FundingBody,
  ) {
    return this.fundings.fund(principal, body);
  }
}
