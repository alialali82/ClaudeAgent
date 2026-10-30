import {
  ExtractInvalidOutputError,
  ExtractUnavailableError,
  extractHoldings,
} from "@/lib/extract/claude";
import { MAX_PDF_PAGES, checkLimits, pdfPageCount, sniffMediaType } from "@/lib/extract/files";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 11 * 1024 * 1024;

function respond(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const fail = (error: string, status: number) => respond({ error }, status);

// Task 10 replaces this no-op with the rate-limit / captcha guard (return a Response to block).
async function beforeHandle(req: Request): Promise<Response | null> {
  void req;
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const blocked = await beforeHandle(req);
  if (blocked) return blocked;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail("too_large", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("bad_request", 400);
  }
  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File)) return fail("bad_request", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) return fail("unsupported_type", 415);
  const limits = checkLimits(mediaType, bytes.byteLength);
  if (!limits.ok) return fail(limits.code, limits.status);

  if (mediaType === "application/pdf") {
    const pages = await pdfPageCount(bytes);
    if (pages === null) return fail("unreadable_pdf", 422);
    if (pages > MAX_PDF_PAGES) return fail("too_many_pages", 422);
  }

  try {
    const result = await extractHoldings({ bytes, mediaType });
    return respond(result);
  } catch (e) {
    if (e instanceof ExtractUnavailableError) return fail("unavailable", 503);
    if (e instanceof ExtractInvalidOutputError) return fail("extract_invalid_output", 422);
    return fail("extract_failed", 502);
  }
}
