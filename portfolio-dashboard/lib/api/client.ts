import type { Dashboard } from "@/lib/dashboard/build";
import type { Holding } from "@/lib/types";

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ApiError";
    this.code = code;
  }
}

const TEXT: Record<string, string> = {
  rate_limited: "Too many requests — try again in an hour",
  busy: "The service is busy today — try again later",
  captcha: "Verification failed — reload the page",
  too_large: "That file is too large",
  unsupported_type: "That file type isn't supported",
  too_many_pages: "PDFs are limited to 10 pages",
  unreadable_pdf: "We couldn't open that PDF — it may be damaged or password-protected",
  extract_invalid_output:
    "We couldn't read that file — try a clearer image or enter holdings manually",
  unavailable: "Reading files is unavailable right now — enter holdings manually or try later",
  extract_failed: "We couldn't read that file — try again or enter holdings manually",
  bad_request: "The request was not valid — check your holdings and try again",
  too_many: "Too many holdings (max 100)",
  no_holdings: "No valid holdings to analyze",
  length_required: "The request could not be sent — reload the page and try again",
  analyze_failed: "The analysis failed — please try again",
  network: "Network problem — check your connection and try again",
};

/** Human text for a server/client error code. */
export function errorText(code: string): string {
  return TEXT[code] ?? "Something went wrong — please try again";
}

async function failFrom(res: Response): Promise<never> {
  let code = "analyze_failed";
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string") code = j.error;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(code);
}

export async function extractFile(
  file: File,
  token: string,
  signal?: AbortSignal,
): Promise<{ holdings: Holding[]; warnings: string[] }> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/extract", { method: "POST", body: form, headers: { "x-turnstile-token": token }, signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new ApiError("network");
  }
  if (!res.ok) return failFrom(res);
  const j = (await res.json()) as { holdings?: Holding[]; warnings?: string[] };
  return { holdings: j.holdings ?? [], warnings: j.warnings ?? [] };
}

/** Split buffered NDJSON text into complete lines and the unfinished remainder. */
export function splitNdjson(rest: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (rest + chunk).split("\n");
  const tail = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim() !== ""), rest: tail };
}

type Msg =
  | { type: "progress"; done: number; of: number }
  | { type: "dashboard"; data: Dashboard }
  | { type: "error"; code: string };

export async function analyzeStream(
  holdings: Holding[],
  token: string,
  opts: { onProgress?: (done: number, of: number) => void; signal?: AbortSignal },
): Promise<Dashboard> {
  let res: Response;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-turnstile-token": token },
      body: JSON.stringify({ holdings }),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new ApiError("network");
  }
  if (!res.ok || !res.body) return failFrom(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let result: Dashboard | null = null;

  const handle = (line: string) => {
    let m: Msg;
    try {
      m = JSON.parse(line) as Msg;
    } catch {
      return;
    }
    if (m.type === "progress") opts.onProgress?.(m.done, m.of);
    else if (m.type === "dashboard") result = m.data;
    else if (m.type === "error") throw new ApiError(typeof m.code === "string" ? m.code : "analyze_failed");
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const s = splitNdjson(rest, decoder.decode(value, { stream: true }));
    rest = s.rest;
    s.lines.forEach(handle);
  }
  rest += decoder.decode();
  if (rest.trim()) handle(rest);
  if (!result) throw new ApiError("analyze_failed");
  return result;
}
