import { z } from "zod";
import { ACCOUNT_MAX, COST_MAX, HOLDINGS_MAX, SHARES_MAX, IMAGE_MAX, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, PDF_MAX, SAVED_JSON_MAX } from "@/lib/limits";
import type { Holding } from "@/lib/types";

export type FileKind = "sheet" | "json" | "image" | "pdf";

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Classify by extension AND MIME; null when unsupported or the two disagree. */
export function classifyFile(file: File): FileKind | null {
  const n = file.name.toLowerCase();
  const t = file.type;
  if (/\.(xlsx|csv)$/.test(n)) return "sheet";
  if (n.endsWith(".json")) return !t || t === "application/json" || t === "text/json" ? "json" : null;
  if (n.endsWith(".pdf")) return !t || t === "application/pdf" ? "pdf" : null;
  if (IMAGE_EXT.test(n)) return !t || IMAGE_MIME.has(t) ? "image" : null;
  return null;
}

/** Returns an error message when the file is over the cap, else null. Checked before any upload. */
export function sizeProblem(file: File, kind: FileKind | null): string | null {
  const typeCap = kind === "pdf" ? PDF_MAX : kind === "image" ? IMAGE_MAX : kind === "json" ? SAVED_JSON_MAX : Infinity;
  if (file.size > MAX_UPLOAD_BYTES || file.size > typeCap) {
    const mb = Math.min(MAX_UPLOAD_MB, typeCap / (1024 * 1024));
    return kind === "json" ? "That file is too large to be a saved holdings file" : `File too large (max ${mb} MB)`;
  }
  return null;
}

const SavedHolding = z.object({
  ticker: z.string().min(1).max(64),
  shares: z.number().finite().positive().max(SHARES_MAX),
  cost: z.number().finite().min(0).max(COST_MAX).optional(),
  costKind: z.enum(["total", "perShare"]).optional(),
  account: z.string().max(ACCOUNT_MAX).optional(),
  openDate: z.string().max(10).optional(),
});
const Saved = z.union([
  z.object({ holdings: z.array(SavedHolding).max(HOLDINGS_MAX) }).transform((o) => o.holdings),
  z.array(SavedHolding).max(HOLDINGS_MAX),
]);

/** Parse a previously saved holdings file; null when invalid. */
export function parseSavedHoldings(text: string): Holding[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = Saved.safeParse(raw);
  return r.success ? (r.data as Holding[]) : null;
}

export function serializeHoldings(holdings: Holding[]): string {
  return JSON.stringify({ version: 1, holdings }, null, 2);
}
