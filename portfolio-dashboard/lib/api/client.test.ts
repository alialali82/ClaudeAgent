import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, analyzeStream, errorText, extractFile, splitNdjson } from "./client";

const enc = new TextEncoder();
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}
const holdings = [{ ticker: "AAPL", shares: 1 }];

afterEach(() => vi.unstubAllGlobals());

describe("errorText", () => {
  it("maps server codes to human text", () => {
    expect(errorText("rate_limited")).toBe("Too many requests — try again in an hour");
    expect(errorText("busy")).toBe("The service is busy today — try again later");
    expect(errorText("captcha")).toBe("Verification failed — reload the page");
    expect(errorText("too_many_pages")).toBe("PDFs are limited to 10 pages");
    expect(errorText("extract_invalid_output")).toMatch(/couldn't read that file/);
    for (const c of ["too_large", "unsupported_type", "unreadable_pdf", "unavailable", "extract_failed", "bad_request", "too_many", "no_holdings", "length_required", "analyze_failed"]) {
      expect(errorText(c).length).toBeGreaterThan(5);
      expect(errorText(c)).not.toBe(errorText("totally_unknown"));
    }
    expect(errorText("totally_unknown")).toMatch(/went wrong/i);
  });
});

describe("splitNdjson", () => {
  it("buffers a partial line across chunks", () => {
    const a = splitNdjson("", '{"type":"progress","do');
    expect(a.lines).toEqual([]);
    const b = splitNdjson(a.rest, 'ne":1,"of":2}\n{"type":"x"}\n{"ty');
    expect(b.lines).toEqual(['{"type":"progress","done":1,"of":2}', '{"type":"x"}']);
    expect(b.rest).toBe('{"ty');
  });
});

describe("extractFile", () => {
  it("posts multipart with the token and returns holdings", async () => {
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-turnstile-token"]).toBe("tok");
      expect(init.body).toBeInstanceOf(FormData);
      return Response.json({ holdings, warnings: ["w"] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await extractFile(new File(["x"], "a.png", { type: "image/png" }), "tok");
    expect(r).toEqual({ holdings, warnings: ["w"] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
  });
  it("throws ApiError with the server code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited" }, { status: 429 })));
    await expect(extractFile(new File(["x"], "a.png"), "t")).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("analyzeStream", () => {
  it("handles a chunk boundary mid-line, reports progress, returns the dashboard", async () => {
    const dash = { total: 5 };
    const body = streamOf([
      '{"type":"progress","done":1,"of":2}\n{"type":"prog',
      'ress","done":2,"of":2}\n{"type":"dash',
      `board","data":${JSON.stringify(dash)}}\n`,
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const seen: [number, number][] = [];
    const r = await analyzeStream(holdings, "tok", { onProgress: (d, o) => seen.push([d, o]) });
    expect(seen).toEqual([[1, 2], [2, 2]]);
    expect(r).toEqual(dash);
  });
  it("throws on an error line", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(['{"type":"error","code":"analyze_failed"}\n']))));
    await expect(analyzeStream(holdings, "t", {})).rejects.toMatchObject({ code: "analyze_failed" });
  });
  it("throws a coded error for non-OK JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "busy" }, { status: 503 })));
    const p = analyzeStream(holdings, "t", {});
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ code: "busy" });
  });
  it("throws when the stream ends without a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(['{"type":"progress","done":1,"of":2}\n']))));
    await expect(analyzeStream(holdings, "t", {})).rejects.toMatchObject({ code: "analyze_failed" });
  });
});
