import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { uuidParam } from '../accounts/accounts.schemas.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
import { Idempotent } from '../idempotency/idempotency.decorator.js';
import {
  IdempotencyService,
  type IdempotencyContext,
  type ResponseWriter,
} from '../idempotency/idempotency.service.js';
import type { PayoutRecord } from './payouts.repository.js';
import { payoutBody, type PayoutBody } from './payouts.schemas.js';
import { PayoutsService } from './payouts.service.js';

// BIGINT values are serialized as strings: JSON numbers lose precision above 2^53.
const toPayoutResponse = (payout: PayoutRecord) => ({
  id: payout.id,
  accountId: payout.accountId,
  amount: payout.amount.toString(),
  status: payout.status,
  destination: payout.destination,
  entryId: payout.entryId,
  settlementEntryId: payout.settlementEntryId,
  createdAt: payout.createdAt.toISOString(),
  updatedAt: payout.updatedAt.toISOString(),
});

@ApiTags('payouts')
@Controller('v1/payouts')
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @Scopes('platform', 'user')
  @ApiZodBody(payoutBody)
  request(
    @CurrentPrincipal() principal: Principal,
    @Idempotent() idem: IdempotencyContext,
    @Body(new ZodValidationPipe(payoutBody)) body: PayoutBody,
    @Res({ passthrough: true }) res: ResponseWriter,
  ) {
    return this.idempotency.respond(res, idem, async (tx) =>
      toPayoutResponse(await this.payouts.request(tx, principal, body)),
    );
  }

  @Post(':id/settle')
  @Scopes('ops')
  settle(
    @Idempotent() idem: IdempotencyContext,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
    @Res({ passthrough: true }) res: ResponseWriter,
  ) {
    return this.idempotency.respond(res, idem, async (tx) =>
      toPayoutResponse(await this.payouts.settle(tx, id)),
    );
  }

  @Get(':id')
  @Scopes('platform', 'user', 'ops', 'auditor')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
  ) {
    return toPayoutResponse(await this.payouts.get(principal, id));
  }
}
