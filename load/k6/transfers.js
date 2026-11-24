import http from 'k6/http';
import { check, fail } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.K6_API_KEY;
const WALLETS = Number(__ENV.WALLETS || 20);
const FUNDING = __ENV.FUNDING || '100000000';
const RATE = Number(__ENV.RATE || 100);

// 422 (e.g. insufficient funds) is an expected business answer, not a failure.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 422));

export const options = {
  scenarios: {
    transfers: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: RATE, duration: '30s' },
        { target: RATE, duration: '1m' },
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

function post(path, body) {
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': uuidv4(),
    },
  });
}

export function setup() {
  if (!API_KEY) fail('K6_API_KEY (platform scope) is required');
  const wallets = [];
  for (let i = 0; i < WALLETS; i++) {
    const created = post('/v1/accounts', { ownerRef: `k6-${uuidv4()}` });
    if (created.status !== 201) fail(`wallet creation failed: ${created.status} ${created.body}`);
    const id = created.json('id');
    const funded = post('/v1/fundings', { accountId: id, amount: FUNDING });
    if (funded.status !== 201) fail(`funding failed: ${funded.status} ${funded.body}`);
    wallets.push(id);
  }
  return { wallets };
}

export default function (data) {
  // Deterministic spread over wallet pairs; no randomness needed for load shape.
  const count = data.wallets.length;
  const from = __ITER % count;
  const to = (from + 1 + (Math.floor(__ITER / count) % (count - 1))) % count;
  const res = post('/v1/transfers', {
    fromAccountId: data.wallets[from],
    toAccountId: data.wallets[to],
    amount: '1000',
  });
  check(res, { 'transfer accepted': (r) => r.status === 201 || r.status === 200 });
}
