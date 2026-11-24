import { Module } from '@nestjs/common';
import { EndpointsRepository } from './endpoints.repository.js';
import { SecretVault } from './secret-vault.js';
import { TargetGuard } from './target-guard.js';

/** Pieces shared by the HTTP API and the delivery worker. */
@Module({
  providers: [SecretVault, TargetGuard, EndpointsRepository],
  exports: [SecretVault, TargetGuard, EndpointsRepository],
})
export class WebhookCoreModule {}
