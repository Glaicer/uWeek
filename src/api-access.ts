import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { ApiError } from "./api-errors";
import { authenticateApiToken, type ApiPrincipal } from "./api-tokens";

const globalForLimiter = globalThis as typeof globalThis & {
  yourweekApiLimiter?: RateLimiterMemory;
};

// why: dev hot reload re-evaluates modules; one budget must cover every protected route
const limiter = (globalForLimiter.yourweekApiLimiter ??= new RateLimiterMemory({
  points: 120,
  duration: 60,
}));

function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function authorizeApiRequest(
  request: Request,
): Promise<ApiPrincipal> {
  const token = bearerToken(request.headers.get("authorization"));
  if (token === null) throw new ApiError("unauthorized", "Unauthorized");
  // why: revocation is checked before the budget, so a revoked token is always 401 and never 429
  const principal = await authenticateApiToken(token);
  if (principal === null) throw new ApiError("unauthorized", "Unauthorized");
  try {
    await limiter.consume(principal.tokenId);
  } catch (error) {
    if (error instanceof RateLimiterRes)
      throw new ApiError("rate_limited", "Rate limit exceeded", {
        "Retry-After": String(
          Math.max(1, Math.ceil(error.msBeforeNext / 1000)),
        ),
      });
    throw error;
  }
  return principal;
}
