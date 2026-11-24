import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import type { JournalEntry } from '../../domain/ledger/journal-entry.js';
import { uuidParam } from '../accounts/accounts.schemas.js';
import { Scopes } from '../auth/decorators.js';
import { Idempotent } from '../idempotency/idempotency.decorator.js';
import {
  IdempotencyService,
  type IdempotencyContext,
  type ResponseWriter,
} from '../idempotency/idempotency.service.js';
import { reverseBody, type ReverseBody } from './entries.schemas.js';
import { ReversalsService } from './reversals.service.js';

// BIGINT values are serialized as strings: JSON numbers lose precision above 2^53.
const toEntryResponse = (entry: JournalEntry) => ({
  id: entry.id,
  kind: entry.kind,
  description: entry.description,
  reversalOf: entry.reversalOf,
  postings: entry.postings.map((p) => ({ accountId: p.accountId, amount: p.amount.toString() })),
});

@ApiTags('entries')
@Controller('v1/entries')
export class EntriesController {
  constructor(
    private readonly reversals: ReversalsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post(':id/reverse')
  @Scopes('ops')
  @ApiZodBody(reverseBody)
  reverse(
    @Idempotent() idem: IdempotencyContext,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
    @Body(new ZodValidationPipe(reverseBody)) body: ReverseBody,
    @Res({ passthrough: true }) res: ResponseWriter,
  ) {
    return this.idempotency.respond(res, idem, async (tx) =>
      toEntryResponse(await this.reversals.reverseByOps(tx, id, body.reason)),
    );
  }
}
