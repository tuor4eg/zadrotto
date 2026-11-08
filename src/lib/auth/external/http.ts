import { hasRequiredPersonalDataConsent } from "@/db/queries/personal-data-consent";
import "server-only";

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { createAccountMergeGrant } from "@/db/operations/account-merge";
import { completeExternalAuth, commitExternalAvatar, ExternalAuthError } from "@/db/operations/external-auth";
import { getCurrentAuthorSession, writeAuthorSessionCookie } from "@/lib/auth/author-auth";
import { shouldUseSecureCookies } from "@/lib/auth/cookies";
import { AUTHOR_AUTH_RATE_LIMITS, checkAuthRateLimit, getAuthRequestIpAddress } from "@/lib/auth/rate-limits";
import { deleteAuthorAvatarBestEffort } from "@/lib/avatars/storage";
import { getRedisClient } from "@/lib/services/redis";
import { getSiteOrigin } from "@/lib/site-url";
import { logActivity } from "@/lib/activity-logs/server";
import { consumeExternalAttempt, EXTERNAL_AUTH_BROWSER_COOKIE, EXTERNAL_AUTH_TTL_SECONDS, hashExternalAuthSecret, newExternalAuthSecret, saveExternalAttempt } from "./attempts";
import { uploadExternalAvatar } from "./avatar";
import { isExternalProviderAvailable, safeExternalReturnTo, validateExternalIdentity, type ExternalAuthAttempt } from "./model";
import { getExternalAuthAdapter } from "./registry";

function redirect(path: string) {
  let origin: URL;
  try { origin = getSiteOrigin(); } catch {
    return new NextResponse("Внешний вход временно недоступен.", {
      status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function failure(error: unknown, intent: "login" | "link" = "login") {
  const code = error instanceof ExternalAuthError ? error.code : "unavailable";
  return redirect(`${intent === "link" ? "/author/profile" : "/author/login"}?externalError=${code}`);
}

export async function startExternalAuth(request: Request, provider: string) {
  let intent: "login" | "link" = "login";
  try {
    const origin = getSiteOrigin();
    if (request.headers.get("origin") !== origin.origin) return new Response("Forbidden", { status: 403 });
    const adapter = await getExternalAuthAdapter(provider);
    if (!adapter || !isExternalProviderAvailable(adapter)) throw new ExternalAuthError("unavailable");
    const body = await callbackParameters(request);
    intent = body.get("intent") === "link" ? "link" : "login";
    const current = await getCurrentAuthorSession();
    if (intent === "link" && current && !(await hasRequiredPersonalDataConsent(current.author.id))) {
      return redirect("/author/consent");
    }
    if (intent === "login" && current) return redirect("/author/profile");
    if (intent === "link" && !current) throw new ExternalAuthError("session-changed");
    const limit = await checkAuthRateLimit({ scope: "author-external-start", ipAddress: await getAuthRequestIpAddress(),
      identitySubject: current ? String(current.author.id) : null, limits: AUTHOR_AUTH_RATE_LIMITS });
    if (!limit.ok) throw new ExternalAuthError("unavailable");
    const client = await getRedisClient();
    if (!client) throw new ExternalAuthError("unavailable");
    const jar = await cookies();
    const existing = jar.get(EXTERNAL_AUTH_BROWSER_COOKIE)?.value;
    const browser = existing && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : newExternalAuthSecret();
    const attempt: ExternalAuthAttempt = {
      provider, intent, browserHash: hashExternalAuthSecret(browser), state: newExternalAuthSecret(),
      verifier: newExternalAuthSecret(), nonce: newExternalAuthSecret(),
      configurationRevision: adapter.configurationRevision,
      returnTo: intent === "link" ? "/author/profile" : safeExternalReturnTo(body.get("returnTo")),
      ...(intent === "link" && current ? { authorId: current.author.id, sessionId: current.session.sessionId } : {}),
    };
    const callbackUrl = new URL(`/author/auth/${encodeURIComponent(provider)}/callback`, origin).href;
    const destination = await adapter.start({ attempt, callbackUrl });
    if (destination.protocol !== "https:") throw new ExternalAuthError("unavailable");
    await saveExternalAttempt(client, attempt);
    const response = NextResponse.redirect(destination, 303);
    const secure = shouldUseSecureCookies();
    response.cookies.set(EXTERNAL_AUTH_BROWSER_COOKIE, browser, {
      httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/author/auth", maxAge: EXTERNAL_AUTH_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) { return failure(error, intent); }
}

async function callbackParameters(request: Request) {
  if (request.method === "GET") return new URL(request.url).searchParams;
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("Invalid callback format");
  // Never buffer an unbounded callback body.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing callback");
  let body = "";
  const decoder = new TextDecoder();
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 16_384) throw new Error("Callback too large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return new URLSearchParams(body + decoder.decode());
  } finally { await reader.cancel(); }
}

export async function finishExternalAuth(request: Request, provider: string) {
  let attempt: ExternalAuthAttempt | null = null;
  try {
    const adapter = await getExternalAuthAdapter(provider);
    if (!adapter || !isExternalProviderAvailable(adapter)) throw new ExternalAuthError("unavailable");
    if (!adapter.callbackMethods.includes(request.method as "GET" | "POST")) return new Response("Method not allowed", { status: 405 });
    const limit = await checkAuthRateLimit({ scope: "author-external-callback", ipAddress: await getAuthRequestIpAddress(), limits: AUTHOR_AUTH_RATE_LIMITS });
    if (!limit.ok) throw new ExternalAuthError("unavailable");
    const parameters = await callbackParameters(request);
    if (parameters.toString().length > 16_384 || parameters.getAll("state").length !== 1) throw new ExternalAuthError("unavailable");
    const browser = (await cookies()).get(EXTERNAL_AUTH_BROWSER_COOKIE)?.value;
    const client = await getRedisClient();
    if (!browser || !client) throw new ExternalAuthError("unavailable");
    attempt = await consumeExternalAttempt(client, { state: parameters.get("state") ?? "", browser, provider });
    if (!attempt) throw new ExternalAuthError("unavailable");
    if (attempt.configurationRevision !== adapter.configurationRevision) throw new ExternalAuthError("unavailable");
    const current = await getCurrentAuthorSession();
    if (attempt.intent === "link" && current && !(await hasRequiredPersonalDataConsent(current.author.id))) {
      return redirect("/author/consent");
    }
    if (attempt.intent === "login" && current) return redirect("/author/profile");
    if (attempt.intent === "link" && (!current || current.author.id !== attempt.authorId || current.session.sessionId !== attempt.sessionId)) {
      throw new ExternalAuthError("session-changed");
    }
    if (parameters.get("error") === "access_denied") return redirect(`${attempt.intent === "link" ? "/author/profile" : "/author/login"}?externalError=cancelled`);
    const callbackUrl = new URL(`/author/auth/${encodeURIComponent(provider)}/callback`, getSiteOrigin()).href;
    const identity = validateExternalIdentity(await adapter.verify({ attempt, callbackUrl, parameters }));
    // Re-read availability at completion; disabled providers cannot finish an old attempt.
    const latest = await getExternalAuthAdapter(provider);
    if (!latest || !isExternalProviderAvailable(latest) || latest.configurationRevision !== adapter.configurationRevision) throw new ExternalAuthError("unavailable");
    const requestHeaders = await headers();
    let result;
    try {
      result = await completeExternalAuth({ ...identity, provider, configurationRevision: adapter.configurationRevision, intent: attempt.intent,
        authorId: attempt.authorId, sessionId: attempt.sessionId,
        ipAddress: await getAuthRequestIpAddress(), userAgent: requestHeaders.get("user-agent") });
    } catch (error) {
      if (!(error instanceof ExternalAuthError) || error.code !== "conflict" || attempt.intent !== "link" || !current) throw error;
      const { grantId } = await createAccountMergeGrant({ authorId: current.author.id, sessionId: current.session.sessionId, provider, subject: identity.subject, configurationRevision: adapter.configurationRevision! });
      return redirect(`/author/profile/merge?grant=${encodeURIComponent(grantId)}`);
    }
    if (result.token) await writeAuthorSessionCookie(result.token);
    const consentRequired = attempt.intent === "login" && !(await hasRequiredPersonalDataConsent(result.authorId));
    if (!consentRequired && attempt.intent === "login" && identity.avatarUrl && result.avatarSourceIdentityId === result.identityId) {
      let objectKey: string | undefined;
      try {
        objectKey = await uploadExternalAvatar({ authorId: result.authorId, url: identity.avatarUrl, origins: adapter.avatarOrigins });
        const committed = await commitExternalAvatar({ authorId: result.authorId, identityId: result.identityId,
          expectedVersion: result.avatarVersion, objectKey });
        await deleteAuthorAvatarBestEffort(committed.applied ? committed.previousObjectKey ?? null : objectKey);
      } catch {
        if (objectKey) await deleteAuthorAvatarBestEffort(objectKey);
        // The profile remains usable when the provider image/storage is unavailable.
      }
    }
    await logActivity({ action: attempt.intent === "link" ? "author.external.linked" : "author.login", actorType: "author",
      authorId: result.authorId, message: attempt.intent === "link" ? "Автор подключил внешний способ входа." : "Автор вошёл через внешний сервис.",
      metadata: { authMethod: "external", provider } });
    if (consentRequired) {
      return redirect("/author/consent");
    }
    return redirect(attempt.intent === "link" ? "/author/profile?externalLinked=1" : safeExternalReturnTo(attempt.returnTo));
  } catch (error) { return failure(error, attempt?.intent); }
}
