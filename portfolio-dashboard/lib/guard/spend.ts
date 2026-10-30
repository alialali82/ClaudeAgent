import { getKv } from "@/lib/kv";

const DEFAULTS = { claude: 300, firecrawl: 3000 } as const;
const ENV = { claude: "DAILY_CLAUDE_CALLS", firecrawl: "DAILY_FIRECRAWL_CREDITS" } as const;
const TTL_SEC = 48 * 3600;

function cap(kind: keyof typeof DEFAULTS): number {
  const n = Number(process.env[ENV[kind]]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULTS[kind];
}

/**
 * Daily spend cap (UTC day). Fails CLOSED on KV errors.
 * A denied request still consumed its units; counters only grow (acceptable).
 */
export async function spendAllowed(kind: "claude" | "firecrawl", units = 1, now = new Date()): Promise<boolean> {
  try {
    const day = now.toISOString().slice(0, 10);
    const after = await getKv().incrBy(`spend:${kind}:${day}`, units, TTL_SEC);
    return after <= cap(kind);
  } catch {
    return false;
  }
}
