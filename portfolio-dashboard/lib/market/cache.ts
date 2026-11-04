// KV-backed read-through cache with in-process single-flight. KV problems never fail the caller.
import { getKv } from "@/lib/kv";

export const TTL = {
  targets: 6 * 3600,
  prices: 5 * 60,
  history: 24 * 3600,
  profile: 7 * 24 * 3600,
  negative: 10 * 60,
} as const;

const inflight = new Map<string, Promise<unknown>>();

async function run<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await getKv().get<{ v?: T }>(key);
    if (hit && typeof hit === "object" && "v" in hit && hit.v !== undefined) return hit.v;
  } catch {
    // KV unavailable: fall through to load
  }
  const value = await load();
  if (value !== undefined) {
    try {
      await getKv().set(key, { v: value }, ttlSec);
    } catch {
      // best effort
    }
  }
  return value;
}

export function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = run(key, ttlSec, load).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
