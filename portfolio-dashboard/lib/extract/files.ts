import { PDFDocument } from "pdf-lib";

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/** Media type by magic bytes only; the declared MIME type and file name are never trusted. */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  const head = bytes.subarray(0, 1024);
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
  for (let i = 0; i + pdf.length <= head.length; i++) {
    if (startsWith(head, pdf, i)) return "application/pdf";
  }
  return null;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; status: 413 | 415; code: "too_large" | "unsupported_type" };

export function checkLimits(mediaType: MediaType, byteLength: number): LimitResult {
  const max =
    mediaType === "application/pdf" ? MAX_PDF_BYTES
    : mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "image/webp" ? MAX_IMAGE_BYTES
    : null;
  if (max === null) return { ok: false, status: 415, code: "unsupported_type" };
  return byteLength > max ? { ok: false, status: 413, code: "too_large" } : { ok: true };
}

/** Page count, or null when the PDF is unreadable or encrypted. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}
