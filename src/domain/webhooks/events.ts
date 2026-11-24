export const WEBHOOK_EVENT_TYPES = [
  'transfer.completed',
  'funding.completed',
  'payout.requested',
  'payout.paid',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
