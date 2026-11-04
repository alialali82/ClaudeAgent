// Firecrawl v2 scrape (verified against docs.firecrawl.dev 2026-11-04):
// POST https://api.firecrawl.dev/v2/scrape, Authorization: Bearer <key>,
// body { url, formats, onlyMainContent, maxAge(ms) }, 200 -> { success, data: { markdown, metadata } }.
// Errors carry only a short code: never the key, URL or response text. Each request costs ~1 credit.
import { spendAllowed } from "@/lib/guard/spend";

export type ScrapeErrorCode = "budget" | "unavailable" | "auth" | "timeout" | "empty" | "failed";

export class ScrapeError extends Error {
  readonly code: ScrapeErrorCode;
  constructor(code: ScrapeErrorCode) {
    super("scrape failed");
    this.name = "ScrapeError";
    this.code = code;
  }
}

const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 500;

type Attempt = { md: string } | { retry: ScrapeErrorCode };

async function attempt(url: string, key: string, maxAgeMs?: number): Promise<Attempt> {
  if (!(await spendAllowed("firecrawl", 1))) throw new ScrapeError("budget");
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const n = (e as { name?: string } | null)?.name;
    return { retry: n === "TimeoutError" || n === "AbortError" ? "timeout" : "failed" };
  }
  if (res.status === 401 || res.status === 403) throw new ScrapeError("auth");
  if (res.status === 429 || res.status >= 500) return { retry: "failed" };
  if (!res.ok) throw new ScrapeError("failed");
  let md: unknown;
  try {
    const body = (await res.json()) as { success?: unknown; data?: { markdown?: unknown } };
    md = body?.success === true ? body.data?.markdown : undefined;
  } catch {
    md = undefined;
  }
  if (typeof md !== "string" || !md.trim()) throw new ScrapeError("empty");
  return { md };
}

export async function scrape(url: string, opts: { maxAgeMs?: number } = {}): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new ScrapeError("unavailable");
  const first = await attempt(url, key, opts.maxAgeMs);
  if ("md" in first) return first.md;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  const second = await attempt(url, key, opts.maxAgeMs);
  if ("md" in second) return second.md;
  throw new ScrapeError(second.retry);
}
