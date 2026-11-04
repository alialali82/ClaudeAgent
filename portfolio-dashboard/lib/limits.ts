export const HOLDINGS_MAX = 100;
export const IMAGE_MAX = 5 * 1024 * 1024;
export const PDF_MAX = 10 * 1024 * 1024;
export const SHEET_MAX = 5 * 1024 * 1024;
export const SAVED_JSON_MAX = 256 * 1024;

/**
 * Client-side cap for any upload. Kept below the believed ~4.5 MB hosting
 * request-body limit until that is verified.
 */
export const MAX_UPLOAD_BYTES = (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4) * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** Per-holding value limits; the analyze route and the client validate against the same numbers. */
export const SHARES_MAX = 1e9;
export const COST_MAX = 1e13;
export const ACCOUNT_MAX = 64;
