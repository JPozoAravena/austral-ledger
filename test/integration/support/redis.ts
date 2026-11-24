import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

/** Same image as compose.yaml. */
export function startRedis(): Promise<StartedRedisContainer> {
  return new RedisContainer('redis:8.8.4-alpine').start();
}
