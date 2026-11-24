import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { buildTrialBalance } from '../../domain/ledger/trial-balance.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { Scopes } from '../auth/decorators.js';
import { ReportsRepository } from './reports.repository.js';
import { trialBalanceQuery, type TrialBalanceQuery } from './reports.schemas.js';

// BIGINT values are serialized as strings: JSON numbers lose precision above 2^53.
@ApiTags('reports')
@Controller('v1/reports')
export class ReportsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly reports: ReportsRepository,
  ) {}

  @Get('trial-balance')
  @Scopes('auditor', 'ops')
  @ApiQuery({ name: 'asOf', required: false, type: String, description: 'ISO 8601 instant' })
  async trialBalance(@Query(new ZodValidationPipe(trialBalanceQuery)) query: TrialBalanceQuery) {
    const report = buildTrialBalance(
      await this.reports.accountTotals(this.database.db, query.asOf),
    );
    return {
      asOf: query.asOf?.toISOString() ?? null,
      accounts: report.lines.map((line) => ({
        accountId: line.accountId,
        type: line.type,
        debits: line.debits.toString(),
        credits: line.credits.toString(),
        balance: line.balance.toString(),
      })),
      totals: {
        debits: report.totalDebits.toString(),
        credits: report.totalCredits.toString(),
        balanced: report.balanced,
      },
    };
  }

  /** The expected result is an empty list. */
  @Get('reconciliation')
  @Scopes('auditor', 'ops')
  async reconciliation() {
    const mismatches = await this.reports.reconciliationMismatches(this.database.db);
    return {
      mismatches: mismatches.map((m) => ({
        accountId: m.accountId,
        type: m.type,
        recorded: m.recorded.toString(),
        recalculated: m.recalculated.toString(),
      })),
    };
  }
}
