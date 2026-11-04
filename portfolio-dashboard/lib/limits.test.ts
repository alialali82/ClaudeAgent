import { describe, expect, it } from "vitest";
import { HOLDINGS_MAX, IMAGE_MAX, MAX_UPLOAD_BYTES, PDF_MAX, SHEET_MAX } from "./limits";

describe("limits", () => {
  it("has the documented defaults", () => {
    expect(HOLDINGS_MAX).toBe(100);
    expect(IMAGE_MAX).toBe(5 * 1024 * 1024);
    expect(PDF_MAX).toBe(10 * 1024 * 1024);
    expect(SHEET_MAX).toBe(5 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
  });
});
