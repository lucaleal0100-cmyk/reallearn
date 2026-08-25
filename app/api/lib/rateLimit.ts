import { NextResponse } from "next/server";

type RateLimitOptions = {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  message: string;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const globalRateLimitStore = globalThis as typeof globalThis & {
  realLearnRateLimitStore?: Map<string, RateLimitRecord>;
};

const store = globalRateLimitStore.realLearnRateLimitStore ?? new Map<string, RateLimitRecord>();
globalRateLimitStore.realLearnRateLimitStore = store;

export function enforceRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const clientId = getClientId(request);
  const key = `${options.keyPrefix}:${clientId}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs
    });

    cleanupExpiredRecords(now);
    return null;
  }

  current.count += 1;

  if (current.count <= options.maxRequests) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return NextResponse.json(
    {
      error: options.message,
      retryAfterSeconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}

function getClientId(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return firstForwardedIp || realIp || "unknown";
}

function cleanupExpiredRecords(now: number) {
  if (store.size < 500) {
    return;
  }

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}
