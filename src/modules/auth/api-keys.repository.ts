import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { ApiScope } from '../../domain/auth/api-key.js';
import type { Executor } from '../../infra/db/client.js';
import { apiKeys } from '../../infra/db/schema.js';

export interface StoredApiKey {
  readonly id: string;
  readonly keyHash: string;
  readonly scope: ApiScope;
  readonly subjectRef: string;
}

@Injectable()
export class ApiKeysRepository {
  async findActiveByPrefix(db: Executor, prefix: string): Promise<StoredApiKey | null> {
    const [row] = await db
      .select({
        id: apiKeys.id,
        keyHash: apiKeys.keyHash,
        scope: apiKeys.scope,
        subjectRef: apiKeys.subjectRef,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)));
    return row ?? null;
  }
}
