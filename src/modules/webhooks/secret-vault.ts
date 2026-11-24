import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import {
  decryptSecret,
  encryptSecret,
  parseSecretKey,
} from '../../domain/webhooks/secret-cipher.js';

/** Encrypts endpoint secrets at rest with the key from WEBHOOK_SECRET_KEY. */
@Injectable()
export class SecretVault {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = parseSecretKey(env.WEBHOOK_SECRET_KEY);
  }

  encrypt(plain: string): string {
    return encryptSecret(plain, this.key);
  }

  decrypt(blob: string): string {
    return decryptSecret(blob, this.key);
  }
}
