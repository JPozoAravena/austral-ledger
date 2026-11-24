import type { ApiScope } from '../../domain/auth/api-key.js';

export interface Principal {
  readonly keyId: string;
  readonly scope: ApiScope;
  readonly subjectRef: string;
}

export interface AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  principal?: Principal;
}
