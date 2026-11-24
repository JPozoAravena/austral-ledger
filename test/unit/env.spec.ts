import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  API_KEY_PEPPER: 'p'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT to a number', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails with an explicit message when required vars are missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL.*REDIS_URL.*API_KEY_PEPPER/);
  });

  it('rejects a short API_KEY_PEPPER', () => {
    expect(() => parseEnv({ ...valid, API_KEY_PEPPER: 'short' })).toThrow(/API_KEY_PEPPER/);
  });
});
