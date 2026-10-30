import { rateLimit } from "./rateLimit";
import { spendAllowed } from "./spend";
import { verifyTurnstile } from "./turnstile";

export type GuardResult =
  | { ok: true }
  | { ok: false; status: 400 | 429 | 503; code: "captcha" | "rate_limited" | "busy" };

const LIMITS = { extract: 10, analyze: 30 } as const; // per IP per hour
const WINDOW_SEC = 3600;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xff || req.headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

export async function guardRequest(
  req: Request,
  opts: { route: "extract" | "analyze"; needsCaptcha: boolean },
): Promise<GuardResult> {
  try {
    const ip = clientIp(req);
    if (!(await rateLimit(`${opts.route}:${ip}`, LIMITS[opts.route], WINDOW_SEC)))
      return { ok: false, status: 429, code: "rate_limited" };
    if (opts.needsCaptcha && !(await verifyTurnstile(req.headers.get("x-turnstile-token"), ip)))
      return { ok: false, status: 400, code: "captcha" };
    if (opts.route === "extract" && !(await spendAllowed("claude")))
      return { ok: false, status: 503, code: "busy" };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, code: "busy" };
  }
}
