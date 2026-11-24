# k6 load test

`transfers.js` creates wallets and funds them through the API (setup), then runs a
`ramping-arrival-rate` scenario of wallet-to-wallet transfers, each with a unique `Idempotency-Key`.
Thresholds: `http_req_failed` < 1% (422 business answers are expected) and `p(95)` < 300 ms.

1. Raise the rate limits for the test (they would answer 429): set `RATE_LIMIT_MAX`, `RATE_LIMIT_POST_MAX`
   and `RATE_LIMIT_IP_MAX` to a large value (e.g. 100000) in `.env`, then `docker compose up -d --build`.
2. `npm run db:migrate`, then `npm run seed` (prints the ops key once).
3. `npm run apikey:create -- --scope platform --subject k6` prints a platform key.
4. Run (Git Bash on Windows: prefix `MSYS_NO_PATHCONV=1`):

```sh
docker run --rm -v "$(pwd -W)/load/k6":/s -e API_KEY=<platform key> \
  -e BASE_URL=http://host.docker.internal:3000 grafana/k6:2.4.0 run /s/transfers.js
```

With a local k6 binary the equivalent is `k6 run -e API_KEY=<platform key> load/k6/transfers.js`. 
Never commit the key: pass it only through the environment.

Optional env: `RATE` (peak requests/s, default 100), `WALLETS` (default 20), `FUNDING` (CLP per wallet).

Reference run (compose on Docker Desktop, 100 req/s peak, 8,149 transfers over 100 s):
p(95) = 16 ms, ~81 req/s average, 0% failures.
