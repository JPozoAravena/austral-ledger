export type WebhookErrorCode =
  | 'MALFORMED_SIGNATURE_HEADER'
  | 'TIMESTAMP_OUT_OF_TOLERANCE'
  | 'SIGNATURE_MISMATCH'
  | 'INVALID_URL'
  | 'INSECURE_URL'
  | 'PRIVATE_ADDRESS'
  | 'UNRESOLVABLE_HOST'
  | 'INVALID_SECRET_KEY'
  | 'INVALID_CIPHERTEXT';

export class WebhookDomainError extends Error {
  constructor(
    readonly code: WebhookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WebhookDomainError';
  }
}
