import * as oauth from "oauth4webapi";

import { boundedOAuthResponse } from "./response";

import type { ExternalAuthAdapter, ExternalIdentity } from "./model";

// Static server metadata avoids discovery from a user-controlled issuer or callback.
export function createOAuthAdapter(config: {
  code: string;
  name: string;
  protocol: "oauth2" | "oidc";
  enabled: boolean;
  configured: boolean;
  server: oauth.AuthorizationServer;
  client: oauth.Client;
  clientAuthentication: oauth.ClientAuth;
  scopes: readonly string[];
  avatarOrigins?: readonly string[];
  // OAuth has no universal user-info endpoint/subject format. Resolve using the verified token.
  resolveOAuthIdentity?: (accessToken: string) => Promise<ExternalIdentity>;
}): ExternalAuthAdapter {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.code)) throw new Error("Invalid provider code");
  for (const endpoint of [config.server.issuer, config.server.authorization_endpoint,
    config.server.token_endpoint, config.server.jwks_uri, config.server.userinfo_endpoint]) {
    if (endpoint && new URL(endpoint).protocol !== "https:") throw new Error("HTTPS provider endpoints required");
  }
  if (config.protocol === "oidc" && (!config.server.jwks_uri || !config.scopes.includes("openid"))) {
    throw new Error("OIDC requires JWKS and openid scope");
  }
  if (config.protocol === "oauth2" && !config.resolveOAuthIdentity) throw new Error("OAuth identity resolver required");
  const client: oauth.Client = { ...config.client, id_token_signed_response_alg: config.client.id_token_signed_response_alg ?? "RS256" };
  const options = {
    [oauth.customFetch]: async (url: string, init: RequestInit) => boundedOAuthResponse(await fetch(url, {
      ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    })),
  };
  return {
    code: config.code, name: config.name, protocol: config.protocol,
    enabled: config.enabled, configured: config.configured,
    callbackMethods: ["GET"], avatarOrigins: config.avatarOrigins ?? [],
    async start({ attempt, callbackUrl }) {
      if (!config.server.authorization_endpoint) throw new Error("Authorization endpoint missing");
      const url = new URL(config.server.authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: client.client_id, redirect_uri: callbackUrl, response_type: "code",
        scope: config.scopes.join(" "), state: attempt.state,
        code_challenge: await oauth.calculatePKCECodeChallenge(attempt.verifier),
        code_challenge_method: "S256",
        ...(config.protocol === "oidc" ? { nonce: attempt.nonce } : {}),
      }).toString();
      return url;
    },
    async verify({ attempt, callbackUrl, parameters }) {
      // Unique per-provider callback URLs provide mix-up protection even without response iss.
      const params = oauth.validateAuthResponse(config.server, client, parameters, attempt.state);
      const response = await oauth.authorizationCodeGrantRequest(config.server, client,
        config.clientAuthentication, params, callbackUrl, attempt.verifier, options);
      const tokens = await oauth.processAuthorizationCodeResponse(config.server, client, response, {
        ...options,
        ...(config.protocol === "oidc" ? { expectedNonce: attempt.nonce, requireIdToken: true } : {}),
      });
      if (config.protocol === "oauth2") return config.resolveOAuthIdentity!(tokens.access_token);
      await oauth.validateApplicationLevelSignature(config.server, response, options);
      const claims = oauth.getValidatedIdTokenClaims(tokens)!;
      let profile: Record<string, unknown> = claims;
      if (config.server.userinfo_endpoint) {
        const userInfoResponse = await oauth.userInfoRequest(config.server, client, tokens.access_token, options);
        profile = await oauth.processUserInfoResponse(config.server, client, claims.sub, userInfoResponse);
      }
      return {
        subject: claims.sub,
        name: typeof profile.name === "string" ? profile.name : null,
        avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
        displayValue: typeof profile.preferred_username === "string" ? profile.preferred_username : null,
        ...(typeof profile.email === "string" ? { email: { value: profile.email, verified: profile.email_verified === true } } : {}),
      };
    },
  };
}
