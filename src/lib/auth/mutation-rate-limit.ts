import {
  AUTHOR_AUTH_MUTATION_RATE_LIMITS,
  checkAuthRateLimit,
  getAuthRequestIpAddress,
  type AuthRateLimitScope,
} from "@/lib/auth/rate-limits";
import { hashOpaqueToken } from "@/lib/auth/opaque-token";

export async function checkAuthorAuthMutationRateLimit(
  scope: Extract<AuthRateLimitScope, `author-${string}`>,
  identity: string,
) {
  return checkAuthRateLimit({
    scope,
    ipAddress: await getAuthRequestIpAddress(),
    identitySubject: identity ? hashOpaqueToken(identity) : null,
    limits: AUTHOR_AUTH_MUTATION_RATE_LIMITS,
  });
}
