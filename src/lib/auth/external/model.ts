export type ExternalAuthIntent = "login" | "link";
export type ExternalAuthProtocol = "oauth2" | "oidc" | "signed";
export type ExternalAuthAttempt = {
  provider: string;
  intent: ExternalAuthIntent;
  browserHash: string;
  returnTo: string;
  state: string;
  verifier: string;
  nonce: string;
  configurationRevision?: string;
  authorId?: number;
  sessionId?: number;
};

export type ExternalIdentity = {
  subject: string;
  name?: string | null;
  avatarUrl?: string | null;
  displayValue?: string | null;
  email?: { value: string; verified: boolean };
};

export type ExternalProviderPublic = { code: string; name: string };

// Adapters are trusted server code. Never construct identity results from client input.
export type ExternalAuthAdapter = ExternalProviderPublic & {
  protocol: ExternalAuthProtocol;
  configurationRevision?: string;
  enabled: boolean;
  configured: boolean;
  callbackMethods: readonly ("GET" | "POST")[];
  avatarOrigins: readonly string[];
  start(input: { attempt: ExternalAuthAttempt; callbackUrl: string }): Promise<URL>;
  verify(input: {
    attempt: ExternalAuthAttempt;
    callbackUrl: string;
    parameters: URLSearchParams;
  }): Promise<ExternalIdentity>;
};

export function isExternalProviderAvailable(adapter: ExternalAuthAdapter) {
  return adapter.enabled && adapter.configured;
}

export function safeExternalReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
    || /[\\\u0000-\u0020\u007f]/u.test(value)) return "/author/profile";
  const url = new URL(value, "https://local.invalid");
  return url.origin === "https://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/author/profile";
}

export function validateExternalIdentity(identity: ExternalIdentity): ExternalIdentity {
  if (!identity || typeof identity.subject !== "string" || !identity.subject
    || identity.subject.length > 1024 || /[\u0000-\u001f\u007f]/u.test(identity.subject)) {
    throw new Error("Invalid external subject");
  }
  return {
    subject: identity.subject,
    name: typeof identity.name === "string" && identity.name.trim().length <= 80
      ? identity.name.trim() || null : null,
    displayValue: typeof identity.displayValue === "string" ? identity.displayValue.slice(0, 200) : null,
    avatarUrl: typeof identity.avatarUrl === "string" && identity.avatarUrl.length <= 4096 ? identity.avatarUrl : null,
    // Provider email is deliberately not promoted to a recovery credential.
  };
}
