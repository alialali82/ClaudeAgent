// Direct JSON fetch for Yahoo / Nasdaq. Errors carry only a short code, never URL, headers or body.
export type HttpErrorCode = "timeout" | "network" | "bad_json" | "too_large" | `http_${number}`;

export class HttpError extends Error {
  readonly code: HttpErrorCode;
  constructor(code: HttpErrorCode) {
    super("http request failed");
    this.name = "HttpError";
    this.code = code;
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isTimeout(e: unknown): boolean {
  return typeof e === "object" && e !== null && ["TimeoutError", "AbortError"].includes((e as { name?: string }).name ?? "");
}

async function readCapped(res: Response): Promise<string> {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BYTES) throw new HttpError("too_large");
  if (!res.body) {
    const t = await res.text();
    if (t.length > MAX_BYTES) throw new HttpError("too_large");
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new HttpError("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchJson(url: string, opts: { timeoutMs?: number } = {}): Promise<unknown> {
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new HttpError(`http_${res.status}`);
    }
    text = await readCapped(res);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(isTimeout(e) ? "timeout" : "network");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("bad_json");
  }
}
