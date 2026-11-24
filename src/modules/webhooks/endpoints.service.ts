import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { WebhookDomainError } from '../../domain/webhooks/errors.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import type { Principal } from '../auth/principal.js';
import { EndpointsRepository, type EndpointRecord } from './endpoints.repository.js';
import { SecretVault } from './secret-vault.js';
import { TargetGuard } from './target-guard.js';

export interface CreatedEndpoint {
  readonly endpoint: EndpointRecord;
  /** Plaintext secret: returned once, only its ciphertext is stored. */
  readonly secret: string;
}

@Injectable()
export class EndpointsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly endpoints: EndpointsRepository,
    private readonly vault: SecretVault,
    private readonly guard: TargetGuard,
  ) {}

  async create(principal: Principal, rawUrl: string): Promise<CreatedEndpoint> {
    const { url } = await this.guard.resolve(rawUrl).catch((error: unknown) => {
      if (error instanceof WebhookDomainError) {
        throw new ApiError(422, 'INVALID_WEBHOOK_URL', error.message);
      }
      throw error;
    });
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const endpoint = await this.endpoints.insert(this.database.db, {
      platformRef: principal.subjectRef,
      url: url.toString(),
      secretCiphertext: this.vault.encrypt(secret),
    });
    return { endpoint, secret };
  }

  list(principal: Principal): Promise<EndpointRecord[]> {
    return this.endpoints.listByPlatform(this.database.db, principal.subjectRef);
  }

  async deactivate(principal: Principal, id: string): Promise<void> {
    const found = await this.endpoints.deactivate(this.database.db, id, principal.subjectRef);
    if (!found) throw notFound('Webhook endpoint');
  }
}
