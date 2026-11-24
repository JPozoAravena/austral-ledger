import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { hostnameOf } from '../../domain/webhooks/target-url.js';
import type { ResolvedTarget } from './target-guard.js';

export const SEND_TIMEOUT_MS = 5000;

export class SendError extends Error {
  constructor(readonly code: 'TIMEOUT' | 'NETWORK_ERROR') {
    super(code);
    this.name = 'SendError';
  }
}

@Injectable()
export class HttpSender {
  /**
   * POSTs JSON to the already-validated address and resolves with the status code.
   * Redirects are never followed and the response body is discarded.
   */
  post(target: ResolvedTarget, headers: Record<string, string>, body: string): Promise<number> {
    const { url, address } = target;
    const secure = url.protocol === 'https:';
    const host = hostnameOf(url);
    const send = secure ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const req = send(
        {
          host: address,
          port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          timeout: SEND_TIMEOUT_MS,
          headers: {
            ...headers,
            Host: url.host,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          ...(secure && isIP(host) === 0 ? { servername: host } : {}),
        },
        (res) => {
          res.on('error', () => reject(new SendError('NETWORK_ERROR')));
          res.on('end', () => resolve(res.statusCode ?? 0));
          res.resume();
        },
      );
      req.on('timeout', () => req.destroy(new SendError('TIMEOUT')));
      req.on('error', (error: Error) =>
        reject(error instanceof SendError ? error : new SendError('NETWORK_ERROR')),
      );
      req.end(body);
    });
  }
}
