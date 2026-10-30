import { getKv } from "@/lib/kv";

/** Fixed-window limiter. true = allowed. Fails OPEN on KV errors (the spend cap is the hard backstop). */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const windowIndex = Math.floor(Date.now() / 1000 / windowSec);
    const n = await getKv().incr(`rl:${key}:${windowIndex}`, windowSec);
    return n <= limit;
  } catch {
    console.warn("rate_limit_kv_error"); // code only: no key, no IP
    return true;
  }
}
