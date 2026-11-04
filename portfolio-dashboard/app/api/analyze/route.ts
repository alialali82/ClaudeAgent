import { z } from "zod";
import { buildDashboard } from "@/lib/dashboard/build";
import { guardRequest } from "@/lib/guard/guard";
import { NoPriceError, UnknownTicker, getBenchmarks, getTickerMarket } from "@/lib/market";
import { mergeDuplicates, normalizeTicker } from "@/lib/parse/normalize";
import type { Holding, TickerMarket } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;
const MAX_HOLDINGS = 100;
const CONCURRENCY = 5;
const BUDGET_MS = 50_000;

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

const isoDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

const HoldingSchema = z.object({
  ticker: z.string().max(64),
  shares: z.number().finite().positive(),
  cost: z.number().finite().min(0).optional(),
  costKind: z.enum(["total", "perShare"]).optional(),
  account: z
    .string()
    .transform((s) => s.replace(CONTROL, "").trim())
    .pipe(z.string().max(64))
    .optional(),
  openDate: z.string().optional(),
});
const BodySchema = z.object({ holdings: z.array(HoldingSchema).max(5000) });

function toHoldings(rows: z.infer<typeof HoldingSchema>[]): Holding[] {
  const out: Holding[] = [];
  for (const r of rows) {
    const ticker = normalizeTicker(r.ticker);
    if (!ticker) continue;
    const h: Holding = { ticker, shares: r.shares };
    if (r.cost !== undefined) {
      h.cost = r.cost;
      if (r.costKind) h.costKind = r.costKind;
    }
    if (r.account) h.account = r.account;
    if (r.openDate && isoDate(r.openDate)) h.openDate = r.openDate;
    out.push(h);
  }
  return out;
}

function failCode(e: unknown, signal: AbortSignal): string {
  if (e instanceof UnknownTicker) return "unknown";
  if (e instanceof NoPriceError) return "no_price";
  if (signal.aborted || (e instanceof Error && e.name === "AbortError")) return "deadline";
  return "failed";
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardRequest(req, { route: "analyze", needsCaptcha: true });
  if (!guard.ok) {
    return Response.json(
      { error: guard.code },
      { status: guard.status, headers: { ...noStore, ...(guard.status === 429 ? { "Retry-After": "3600" } : {}) } },
    );
  }

  const header = req.headers.get("content-length");
  const declared = header === null || header.trim() === "" ? NaN : Number(header);
  if (!Number.isFinite(declared) || declared < 0) return fail("length_required", 411);
  if (declared > MAX_BODY_BYTES) return fail("too_large", 413);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return fail("bad_request", 400);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return fail("too_large", 413);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("bad_request", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return fail("bad_request", 400);

  const holdings = mergeDuplicates(toHoldings(parsed.data.holdings));
  if (holdings.length === 0) return fail("no_holdings", 400);
  if (holdings.length > MAX_HOLDINGS) return fail("too_many", 400);

  const tickers = [...new Set(holdings.map((h) => h.ticker))];
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          // client went away
        }
      };
      const ac = new AbortController();
      const { signal } = ac;
      const timer = setTimeout(() => ac.abort(), BUDGET_MS);
      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("deadline"), { name: "AbortError" })), { once: true });
      });
      aborted.catch(() => {}); // never an unhandled rejection

      try {
        const market: Record<string, TickerMarket> = {};
        const failed: Record<string, string> = {};
        let done = 0;
        let next = 0;

        const worker = async () => {
          while (next < tickers.length) {
            const t = tickers[next++];
            if (signal.aborted) {
              failed[t] = "deadline";
            } else {
              try {
                market[t] = await Promise.race([getTickerMarket(t, new Date(), { signal }), aborted]);
              } catch (e) {
                failed[t] = failCode(e, signal);
              }
            }
            done++;
            send({ type: "progress", done, of: tickers.length });
          }
        };

        const benchP = Promise.race([getBenchmarks(new Date(), { signal }), aborted]).catch(() => ({
          SPY: [] as [string, number][],
          QQQ: [] as [string, number][],
        }));

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, worker));
        const bench = await benchP;

        const today = new Date().toISOString().slice(0, 10);
        send({ type: "dashboard", data: buildDashboard(holdings, market, bench, today, failed) });
      } catch {
        send({ type: "error", code: "analyze_failed" });
      } finally {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", ...noStore },
  });
}
