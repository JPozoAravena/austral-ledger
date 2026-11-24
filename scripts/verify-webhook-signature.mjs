// Verifies an Austral-Signature header offline. Exit code 0 = valid, 1 = invalid or bad usage.
//
//   cat body.json | npm run webhook:verify -- --secret whsec_... --header "t=...,v1=..."
//   cat body.json | npm run webhook:verify -- --header "t=...,v1=..."   (secret from WEBHOOK_SECRET)
//
// The raw body is read from stdin only: the script never opens paths taken from arguments.
//
// This is a standalone, minimal copy of src/domain/webhooks/signature.ts so it runs without a
// build and can be handed to integrators as a reference. A test signs with the domain and checks
// it against this script, so drift between the two is caught.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const TOLERANCE_SEC = 300;

function fail(reason) {
  console.error(`invalid: ${reason}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    secret: { type: 'string' },
    header: { type: 'string' },
    tolerance: { type: 'string' },
  },
});
const secret = values.secret ?? process.env.WEBHOOK_SECRET;
if (!secret || !values.header)
  fail('usage: --secret (or WEBHOOK_SECRET) and --header are required');

let body;
try {
  body = readFileSync(0, 'utf8');
} catch {
  fail('could not read the body from stdin');
}

let timestamp = null;
const signatures = [];
for (const part of values.header.split(',')) {
  const [key, value = ''] = part.split(/=(.*)/s).map((piece) => piece.trim());
  if (key === 't' && /^\d{1,15}$/.test(value)) timestamp = Number(value);
  else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value))
    signatures.push(Buffer.from(value, 'hex'));
}
if (timestamp === null || signatures.length === 0) fail('malformed signature header');

const tolerance = values.tolerance === undefined ? TOLERANCE_SEC : Number(values.tolerance);
if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) {
  fail('timestamp outside tolerance');
}

const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
if (!signatures.some((candidate) => timingSafeEqual(candidate, expected))) {
  fail('signature mismatch');
}
console.log('valid');
