import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
import { Idempotent } from '../idempotency/idempotency.decorator.js';
import {
  IdempotencyService,
  type IdempotencyContext,
  type ResponseWriter,
} from '../idempotency/idempotency.service.js';
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
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('transfers')
  @Scopes('platform', 'user')
  @ApiZodBody(transferBody)
  transfer(
    @CurrentPrincipal() principal: Principal,
    @Idempotent() idem: IdempotencyContext,
    @Body(new ZodValidationPipe(transferBody)) body: TransferBody,
    @Res({ passthrough: true }) res: ResponseWriter,
  ) {
    return this.idempotency.respond(res, idem, (tx) =>
      this.transfers.transfer(tx, principal, body),
    );
  }

  @Post('fundings')
  @Scopes('platform')
  @ApiZodBody(fundingBody)
  fund(
    @CurrentPrincipal() principal: Principal,
    @Idempotent() idem: IdempotencyContext,
    @Body(new ZodValidationPipe(fundingBody)) body: FundingBody,
    @Res({ passthrough: true }) res: ResponseWriter,
  ) {
    return this.idempotency.respond(res, idem, (tx) => this.fundings.fund(tx, principal, body));
  }
}
