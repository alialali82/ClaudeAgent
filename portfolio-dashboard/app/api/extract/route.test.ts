import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const guardRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guard/guard", () => ({ guardRequest }));

import { POST } from "./route";

const MB = 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngOf = (n: number) => {
  const b = new Uint8Array(n);
  b.set(PNG);
  return b;
};
async function pdfOf(pages: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return d.save();
}
async function req(files: { bytes: Uint8Array; name?: string; type?: string }[] | null, headers: Record<string, string> = {}) {
  const fd = new FormData();
  for (const f of files ?? []) fd.append("file", new File([f.bytes as BlobPart], f.name ?? "x.png", { type: f.type ?? "image/png" }));
  // Serialise so the request carries a real content-length, like a browser upload.
  const probe = new Response(fd);
  const raw = new Uint8Array(await probe.arrayBuffer());
  return new Request("http://localhost/api/extract", {
    method: "POST",
    body: raw,
    headers: { "content-type": probe.headers.get("content-type") ?? "", "content-length": String(raw.byteLength), ...headers },
  });
}
async function rawReq(fd: FormData) {
  const probe = new Response(fd);
  const raw = new Uint8Array(await probe.arrayBuffer());
  return new Request("http://localhost/api/extract", {
    method: "POST",
    body: raw,
    headers: { "content-type": probe.headers.get("content-type") ?? "", "content-length": String(raw.byteLength) },
  });
}
const reply = (text: string) => create.mockResolvedValue({ content: [{ type: "text", text }], stop_reason: "end_turn" });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  create.mockReset();
  guardRequest.mockReset();
  guardRequest.mockResolvedValue({ ok: true });
});
afterEach(() => vi.restoreAllMocks());

const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("POST /api/extract guard", () => {
  it("runs the guard first with route extract + captcha, before reading the body", async () => {
    reply("[]");
    const request = await req([{ bytes: pngOf(10) }]);
    const spy = vi.spyOn(request, "formData");
    guardRequest.mockImplementation(async () => {
      expect(spy).not.toHaveBeenCalled();
      return { ok: true };
    });
    await POST(request);
    expect(guardRequest).toHaveBeenCalledWith(request, { route: "extract", needsCaptcha: true });
  });
  it.each([
    [400, "captcha"],
    [429, "rate_limited"],
    [503, "busy"],
  ])("blocked %i %s returns it and never touches the body or Anthropic", async (status, code) => {
    guardRequest.mockResolvedValue({ ok: false, status, code });
    const request = await req([{ bytes: pngOf(10) }]);
    const spy = vi.spyOn(request, "formData");
    const r = await POST(request);
    expect(r.status).toBe(status);
    expect(await body(r)).toEqual({ error: code });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(spy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it("429 carries Retry-After; other statuses do not", async () => {
    guardRequest.mockResolvedValue({ ok: false, status: 429, code: "rate_limited" });
    expect((await POST(await req([{ bytes: pngOf(10) }]))).headers.get("retry-after")).toBe("3600");
    guardRequest.mockResolvedValue({ ok: false, status: 503, code: "busy" });
    expect((await POST(await req([{ bytes: pngOf(10) }]))).headers.get("retry-after")).toBeNull();
  });
  it("411 length_required without a content-length header (after the guard)", async () => {
    const fd = new FormData();
    fd.append("file", new File([pngOf(10) as BlobPart], "x.png", { type: "image/png" }));
    const stream = new Response(fd);
    const r = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: stream.body,
        headers: { "content-type": stream.headers.get("content-type") ?? "" },
        duplex: "half",
      } as RequestInit),
    );
    expect(guardRequest).toHaveBeenCalled();
    expect(r.status).toBe(411);
    expect(await body(r)).toEqual({ error: "length_required" });
    expect(create).not.toHaveBeenCalled();
  });
  it("411 for a non-numeric content-length", async () => {
    const r = await POST(await req([{ bytes: pngOf(10) }], { "content-length": "abc" }));
    expect(r.status).toBe(411);
  });
});

describe("POST /api/extract", () => {
  it("400 when there is no file", async () => {
    const r = await POST(await req(null));
    expect(r.status).toBe(400);
    expect(await body(r)).toEqual({ error: "bad_request" });
  });
  it("400 for a non-multipart body", async () => {
    const r = await POST(new Request("http://localhost/api/extract", { method: "POST", body: "hi", headers: { "content-length": "2" } }));
    expect(r.status).toBe(400);
  });
  it("400 when the field is a string, not a File", async () => {
    const fd = new FormData();
    fd.append("file", "just text");
    const r = await POST(await rawReq(fd));
    expect(r.status).toBe(400);
  });
  it("400 for two files", async () => {
    const r = await POST(await req([{ bytes: pngOf(10) }, { bytes: pngOf(10) }]));
    expect(r.status).toBe(400);
  });
  it("413 early on a huge content-length", async () => {
    const r = await POST(await req([{ bytes: pngOf(10) }], { "content-length": String(11 * MB + 1) }));
    expect(r.status).toBe(413);
    expect(await body(r)).toEqual({ error: "too_large" });
    expect(create).not.toHaveBeenCalled();
  });
  it("413 for an image over 5 MB", async () => {
    const r = await POST(await req([{ bytes: pngOf(5 * MB + 1) }]));
    expect(r.status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });
  it("413 for a PDF over 10 MB", async () => {
    const big = new Uint8Array(10 * MB + 1);
    big.set(new TextEncoder().encode("%PDF-1.7\n"));
    const r = await POST(await req([{ bytes: big, name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });
  it("413 on declared file size > 10 MB before reading its bytes", async () => {
    const big = new Uint8Array(10 * MB + 1);
    big.set(PNG);
    const request = await req([{ bytes: big }]);
    const spy = vi.spyOn(Blob.prototype, "arrayBuffer");
    const r = await POST(request);
    expect(r.status).toBe(413);
    expect(await body(r)).toEqual({ error: "too_large" });
    expect(spy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it("accepts an image of exactly 5 MB", async () => {
    reply("[]");
    expect((await POST(await req([{ bytes: pngOf(5 * MB) }]))).status).toBe(200);
  });
  it("accepts a valid PDF of exactly 10 MB", async () => {
    reply("[]");
    const pdf = await pdfOf(1);
    const padded = new Uint8Array(10 * MB).fill(0x0a); // trailing newlines after %%EOF
    padded.set(pdf);
    const r = await POST(await req([{ bytes: padded, name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(200);
  });
  it("422 unreadable_pdf for a valid header with garbage", async () => {
    const junk = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 9 0 R >> endobj\n<<<<garbage>>>>");
    const r = await POST(await req([{ bytes: junk, name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(422);
    expect(await body(r)).toEqual({ error: "unreadable_pdf" });
  });
  it("415 for unsupported bytes, even when the name and MIME claim an image", async () => {
    const r = await POST(await req([{ bytes: new TextEncoder().encode("hello"), name: "fake.png", type: "image/png" }]));
    expect(r.status).toBe(415);
    expect(await body(r)).toEqual({ error: "unsupported_type" });
  });
  it("422 for an 11 page PDF", async () => {
    const r = await POST(await req([{ bytes: await pdfOf(11), name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(422);
    expect(await body(r)).toEqual({ error: "too_many_pages" });
    expect(create).not.toHaveBeenCalled();
  });
  it("422 for an unreadable PDF", async () => {
    const r = await POST(await req([{ bytes: new TextEncoder().encode("%PDF-1.4 junk"), name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(422);
    expect(await body(r)).toEqual({ error: "unreadable_pdf" });
  });
  it("accepts a 10 page PDF", async () => {
    reply("[]");
    const r = await POST(await req([{ bytes: await pdfOf(10), name: "a.pdf", type: "application/pdf" }]));
    expect(r.status).toBe(200);
  });
  it("503 without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await POST(await req([{ bytes: pngOf(100) }]));
    expect(r.status).toBe(503);
    expect(await body(r)).toEqual({ error: "unavailable" });
  });
  it("502 when the client throws, without leaking its message", async () => {
    create.mockRejectedValue(new Error("upstream secret detail 42"));
    const r = await POST(await req([{ bytes: pngOf(100) }]));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await body(r))).not.toContain("secret");
  });
  it("422 extract_invalid_output on a bad reply", async () => {
    reply("nope");
    const r = await POST(await req([{ bytes: pngOf(100) }]));
    expect(r.status).toBe(422);
    expect(await body(r)).toEqual({ error: "extract_invalid_output" });
  });
  it("200 with holdings, warnings and no-store", async () => {
    reply('[{"ticker":"AAPL","shares":3}]');
    const r = await POST(await req([{ bytes: pngOf(100) }]));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const b = await body(r);
    expect(b.holdings).toEqual([{ ticker: "AAPL", shares: 3 }]);
    expect(Array.isArray(b.warnings)).toBe(true);
  });
  it("sets no-store on error responses too", async () => {
    const r = await POST(await req(null));
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("never logs file bytes, holdings or model text", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const marker = "ZQXMARKER";
    const bytes = pngOf(200);
    bytes.set(new TextEncoder().encode(marker), 20);
    reply('Here: [{"ticker":"ZQXT","shares":3}] MODELTEXT-777');
    await POST(await req([{ bytes }]));
    create.mockRejectedValue(new Error("boom ZQXT MODELTEXT-777"));
    await POST(await req([{ bytes }]));
    reply("garbage MODELTEXT-777 ZQXT");
    await POST(await req([{ bytes }]));
    const logged = spies.flatMap((s) => s.mock.calls.flat().map((a) => (a instanceof Error ? a.message : String(a))));
    for (const needle of ["ZQXT", marker, "MODELTEXT-777", "boom"]) {
      expect(logged.some((l) => l.includes(needle))).toBe(false);
    }
  });
});
