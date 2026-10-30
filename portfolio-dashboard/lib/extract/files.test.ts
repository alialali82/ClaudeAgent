import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkLimits, pdfPageCount, sniffMediaType } from "./files";

const MB = 1024 * 1024;
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const webp = () => new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ");
const pdfHead = () => new TextEncoder().encode("%PDF-1.7\n1 0 obj");

export async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe("sniffMediaType", () => {
  it("detects each supported type by magic bytes", () => {
    expect(sniffMediaType(png())).toBe("image/png");
    expect(sniffMediaType(jpeg())).toBe("image/jpeg");
    expect(sniffMediaType(webp())).toBe("image/webp");
    expect(sniffMediaType(pdfHead())).toBe("application/pdf");
  });
  it("finds %PDF- within the first 1024 bytes but not after", () => {
    const pad = new Uint8Array(1000);
    const inside = new Uint8Array([...pad, ...pdfHead()]);
    expect(sniffMediaType(inside)).toBe("application/pdf");
    const outside = new Uint8Array([...new Uint8Array(1100), ...pdfHead()]);
    expect(sniffMediaType(outside)).toBeNull();
  });
  it("returns null for garbage, empty and text that merely claims to be an image", () => {
    expect(sniffMediaType(new Uint8Array(0))).toBeNull();
    expect(sniffMediaType(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
    expect(sniffMediaType(new TextEncoder().encode("image/png fake.png hello"))).toBeNull();
    expect(sniffMediaType(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
  });
});

describe("checkLimits", () => {
  it("allows images up to exactly 5 MB and rejects +1", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp"] as const) {
      expect(checkLimits(t, 5 * MB)).toEqual({ ok: true });
      expect(checkLimits(t, 5 * MB + 1)).toEqual({ ok: false, status: 413, code: "too_large" });
    }
  });
  it("allows PDFs up to exactly 10 MB and rejects +1", () => {
    expect(checkLimits("application/pdf", 10 * MB)).toEqual({ ok: true });
    expect(checkLimits("application/pdf", 10 * MB + 1)).toEqual({ ok: false, status: 413, code: "too_large" });
  });
  it("rejects an unknown type with 415", () => {
    expect(checkLimits("text/plain" as never, 10)).toEqual({ ok: false, status: 415, code: "unsupported_type" });
  });
});

describe("pdfPageCount", () => {
  it("counts pages of real PDFs", async () => {
    expect(await pdfPageCount(await makePdf(1))).toBe(1);
    expect(await pdfPageCount(await makePdf(10))).toBe(10);
    expect(await pdfPageCount(await makePdf(11))).toBe(11);
  });
  it("returns null for garbage and truncated PDFs", async () => {
    expect(await pdfPageCount(new TextEncoder().encode("%PDF-1.4 not really"))).toBeNull();
    const good = await makePdf(2);
    expect(await pdfPageCount(good.slice(0, 20))).toBeNull();
  });
  it("returns null for an encrypted PDF", async () => {
    const good = new TextDecoder("latin1").decode(await makePdf(1));
    const enc = good.replace("/Root", "/Encrypt << /Filter /Standard /V 1 /R 2 /O (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) /U (bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) /P -4 >> /Root");
    const bytes = Uint8Array.from(enc, (c) => c.charCodeAt(0));
    expect(await pdfPageCount(bytes)).toBeNull();
  });
});
