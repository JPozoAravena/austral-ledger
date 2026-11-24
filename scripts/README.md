# Scripts

## verify-webhook-signature.mjs

Checks an `Austral-Signature` header (`t=<unix>,v1=<hex>`) against a raw body read from stdin. The signed payload is
`"<t>.<raw body>"` with HMAC-SHA256 keyed by the endpoint secret (`whsec_...`, shown once when the
endpoint is registered). Timestamps older or newer than 300 s are rejected.

```sh
cat body.json | npm run webhook:verify -- --secret whsec_xxx --header "t=1700000000,v1=..."
```

Exit code `0` prints `valid`; `1` prints `invalid: <reason>`.

## Minimal receiver (Node, no dependencies)

Verify against the raw body, before parsing it:

```js
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk)).on('end', () => {
    const [t, v1] = req.headers['austral-signature'].split(',').map((p) => p.split('=')[1]);
    const expected = createHmac('sha256', process.env.WEBHOOK_SECRET).update(`${t}.${raw}`).digest();
    const fresh = Math.abs(Date.now() / 1000 - Number(t)) <= 300;
    const ok = fresh && timingSafeEqual(Buffer.from(v1, 'hex'), expected);
    res.writeHead(ok ? 200 : 400).end();
  });
}).listen(8080);
```

Answer with any 2xx to acknowledge; anything else is retried with exponential backoff.
