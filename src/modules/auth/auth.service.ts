import { Inject, Injectable } from '@nestjs/common';
import { unauthorized } from '../../common/api-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { parseApiKeyPrefix, verifyApiKey } from '../../domain/auth/api-key.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { ApiKeysRepository } from './api-keys.repository.js';
import type { Principal } from './principal.js';

const BEARER = /^Bearer (\S+)$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly keys: ApiKeysRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async authenticate(authorization: string | undefined): Promise<Principal> {
    const key = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
    const prefix = key === undefined ? null : parseApiKeyPrefix(key);
    if (key === undefined || prefix === null) throw unauthorized();
    const stored = await this.keys.findActiveByPrefix(this.database.db, prefix);
    if (stored === null || !verifyApiKey(key, this.env.API_KEY_PEPPER, stored.keyHash)) {
      throw unauthorized();
    }
    return { keyId: stored.id, scope: stored.scope, subjectRef: stored.subjectRef };
  }
}
