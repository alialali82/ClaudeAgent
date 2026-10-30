import { Redis } from "@upstash/redis";

/**
 * Minimal key-value surface shared by the guards and the market-data cache.
 * `incr` / `incrBy` are atomic and set the TTL only when the key is created
 * (first increment), so fixed windows and daily counters cannot be extended.
 */
export interface Kv {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  incrBy(key: string, by: number, ttlSec: number): Promise<number>;
}

/**
 * In-memory implementation. DEV / TEST ONLY: state is per server instance, so on
 * serverless hosting it does not enforce limits across instances. Production must
 * set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * Values are JSON-serialised to mimic Upstash semantics.
 */
export function createMemoryKv(): Kv {
  const store = new Map<string, { v: string; exp: number | null }>();
  const live = (key: string) => {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.exp !== null && Date.now() >= e.exp) {
      store.delete(key);
      return undefined;
    }
    return e;
  };
  const incrBy = async (key: string, by: number, ttlSec: number) => {
    const e = live(key);
    if (!e) {
      store.set(key, { v: JSON.stringify(by), exp: Date.now() + ttlSec * 1000 });
      return by;
    }
    const n = (JSON.parse(e.v) as number) + by;
    e.v = JSON.stringify(n);
    return n;
  };
  return {
    async get<T = unknown>(key: string) {
      const e = live(key);
      return e ? (JSON.parse(e.v) as T) : null;
    },
    async set(key, value, ttlSec) {
      store.set(key, { v: JSON.stringify(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
    },
    incr: (key, ttlSec) => incrBy(key, 1, ttlSec),
    incrBy,
  };
}

// INCRBY, then EXPIRE only if the key was just created (value == increment), atomically.
const INCR_SCRIPT = `local v = redis.call('INCRBY', KEYS[1], ARGV[1])
if v == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return v`;

function createUpstashKv(redis: Redis): Kv {
  const incrBy = async (key: string, by: number, ttlSec: number) =>
    Number(await redis.eval(INCR_SCRIPT, [key], [String(by), String(ttlSec)]));
  return {
    get: async <T = unknown>(key: string) => (await redis.get<T>(key)) ?? null,
    async set(key, value, ttlSec) {
      if (ttlSec) await redis.set(key, value, { ex: ttlSec });
      else await redis.set(key, value);
    },
    incr: (key, ttlSec) => incrBy(key, 1, ttlSec),
    incrBy,
  };
}

let instance: Kv | null = null;

export function getKv(): Kv {
  if (!instance) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    instance = url && token ? createUpstashKv(new Redis({ url, token })) : createMemoryKv();
  }
  return instance;
}

export function setKvForTests(kv: Kv | null): void {
  instance = kv;
}
