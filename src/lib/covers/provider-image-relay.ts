import { createHmac, timingSafeEqual } from "node:crypto";
import { createBggRuntime } from "@/lib/covers/providers/bgg-runtime";

import type { CoverProviderCode } from "@/lib/covers/types";

const TOKEN_MAX_AGE_SECONDS = 5 * 60;
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROVIDER_IMAGE_HOSTS: Record<CoverProviderCode, readonly string[]> = {
  bgg: ["cf.geekdo-images.com"],
  tmdb: ["image.tmdb.org"],
  "comic-vine": ["comicvine.gamespot.com", ".gamespot.com"],
  "open-library": ["covers.openlibrary.org"],
  "google-books": ["books.google.com", "books.googleusercontent.com", ".googleusercontent.com"],
  igdb: ["images.igdb.com"],
  rawg: ["media.rawg.io"],
  jikan: ["cdn.myanimelist.net"],
  anilist: ["s4.anilist.co"],
  fantlab: ["fantlab.ru"],
  roblox: ["tr.rbxcdn.com"],
};

type ProviderImageTokenPayload = {
  providerCode: CoverProviderCode;
  imageUrl: string;
  exp: number;
};

export type ProviderImageFetchResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; error: "invalid-url" | "unavailable" | "unsupported-type" | "too-large" };

function getSecret() {
  const secret = process.env.PROVIDER_IMAGE_RELAY_SECRET?.trim()
    || process.env.COVER_CANDIDATE_SECRET?.trim()
    || process.env.ADMIN_SESSION_SECRET?.trim()
    || process.env.AUTHOR_SESSION_SECRET?.trim();
  if (!secret) throw new Error("PROVIDER_IMAGE_RELAY_SECRET or a session secret is not set");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function isAllowedHostname(providerCode: CoverProviderCode, hostname: string) {
  return PROVIDER_IMAGE_HOSTS[providerCode].some((allowed) =>
    allowed.startsWith(".") ? hostname.endsWith(allowed) : hostname === allowed,
  );
}

export function isSafeProviderImageUrl(providerCode: CoverProviderCode, value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && isAllowedHostname(providerCode, url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function createProviderImageToken(providerCode: CoverProviderCode, imageUrl: string) {
  if (!isSafeProviderImageUrl(providerCode, imageUrl)) return null;
  const payload = Buffer.from(JSON.stringify({
    providerCode,
    imageUrl,
    exp: Math.floor(Date.now() / 1000) + TOKEN_MAX_AGE_SECONDS,
  } satisfies ProviderImageTokenPayload)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyProviderImageToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ProviderImageTokenPayload;
    if (!value || typeof value.providerCode !== "string" || typeof value.imageUrl !== "string"
      || typeof value.exp !== "number" || value.exp <= Math.floor(Date.now() / 1000)
      || !(value.providerCode in PROVIDER_IMAGE_HOSTS)
      || !isSafeProviderImageUrl(value.providerCode, value.imageUrl)) return null;
    return value;
  } catch {
    return null;
  }
}

export function getProviderImageRelayUrl(providerCode: CoverProviderCode, imageUrl: string) {
  const token = createProviderImageToken(providerCode, imageUrl);
  return token ? `/api/provider-image?token=${encodeURIComponent(token)}` : providerCode === "bgg" ? "" : imageUrl;
}

const bggImageCache = createBggRuntime();
class BggImageFetchError extends Error {
  constructor(readonly result: Extract<ProviderImageFetchResult, { ok: false }>) { super("BGG image unavailable"); }
}

export async function fetchProviderImage(input: {
  providerCode: CoverProviderCode;
  imageUrl: string;
  maxBytes: number;
}): Promise<ProviderImageFetchResult> {
  if (input.providerCode !== "bgg") return fetchUncachedProviderImage(input);
  if (!isSafeProviderImageUrl(input.providerCode, input.imageUrl)) return { ok: false, error: "invalid-url" };
  try {
    const cached = await bggImageCache.cached("public-images", `image:${input.maxBytes}:${input.imageUrl}`, 86_400, AbortSignal.timeout(FETCH_TIMEOUT_MS), async () => {
      const image = await fetchUncachedProviderImage(input);
      if (!image.ok) throw new BggImageFetchError(image);
      return { body: image.body.toString("base64"), contentType: image.contentType };
    });
    return { ok: true, body: Buffer.from(cached.body, "base64"), contentType: cached.contentType };
  } catch (error) { return error instanceof BggImageFetchError ? error.result : { ok: false, error: "unavailable" }; }
}

async function fetchUncachedProviderImage(input: {
  providerCode: CoverProviderCode;
  imageUrl: string;
  maxBytes: number;
}): Promise<ProviderImageFetchResult> {
  if (!isSafeProviderImageUrl(input.providerCode, input.imageUrl)) {
    return { ok: false, error: "invalid-url" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(input.imageUrl, {
      headers: { accept: "image/jpeg,image/png,image/webp" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return { ok: false, error: "unavailable" };
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return { ok: false, error: "unsupported-type" };
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > input.maxBytes) {
      await response.body.cancel();
      return { ok: false, error: "too-large" };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > input.maxBytes) {
        await reader.cancel();
        return { ok: false, error: "too-large" };
      }
      chunks.push(value);
    }
    return { ok: true, body: Buffer.concat(chunks), contentType };
  } catch {
    return { ok: false, error: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
