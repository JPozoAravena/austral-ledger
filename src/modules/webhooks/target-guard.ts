import { lookup } from 'node:dns/promises';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { WebhookDomainError } from '../../domain/webhooks/errors.js';
import { hostnameOf, isPrivateAddress, parseWebhookUrl } from '../../domain/webhooks/target-url.js';

export interface ResolvedTarget {
  readonly url: URL;
  /** Address to connect to; pinning it prevents DNS rebinding between check and use. */
  readonly address: string;
}

/** SSRF defence: runs at registration and again on every delivery. */
@Injectable()
export class TargetGuard {
  private readonly allowPrivate: boolean;

  constructor(@Inject(ENV) env: Env) {
    this.allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  }

  async resolve(raw: string): Promise<ResolvedTarget> {
    const url = parseWebhookUrl(raw, this.allowPrivate);
    let addresses: { address: string }[];
    try {
      addresses = await lookup(hostnameOf(url), { all: true });
    } catch {
      throw new WebhookDomainError('UNRESOLVABLE_HOST', 'Host could not be resolved');
    }
    const [first] = addresses;
    if (first === undefined) {
      throw new WebhookDomainError('UNRESOLVABLE_HOST', 'Host could not be resolved');
    }
    if (!this.allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new WebhookDomainError('PRIVATE_ADDRESS', 'Target resolves to a non-public address');
    }
    return { url, address: first.address };
  }
}
