const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_CHARS = 2048;

/** Verifies a Cloudflare Turnstile token. Fails closed; never logs token, secret or IP. */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  if (!token || token.length > MAX_TOKEN_CHARS) return false;
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
