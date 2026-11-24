import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { uuidParam } from '../accounts/accounts.schemas.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
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
  constructor(private readonly payouts: PayoutsService) {}

  @Post()
  @Scopes('platform', 'user')
  @ApiZodBody(payoutBody)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(payoutBody)) body: PayoutBody,
  ) {
    return toPayoutResponse(await this.payouts.request(principal, body));
  }

  @Post(':id/settle')
  @Scopes('ops')
  async settle(@Param('id', new ZodValidationPipe(uuidParam)) id: string) {
    return toPayoutResponse(await this.payouts.settle(id));
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
