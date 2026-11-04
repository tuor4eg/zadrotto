import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";

import { AVATAR_MAX_BYTES, AVATAR_MAX_INPUT_PIXELS, AVATAR_OUTPUT_SIZE } from "@/lib/avatars/config";
import { buildAuthorAvatarObjectKey } from "@/lib/avatars/storage";
import { uploadS3Object } from "@/lib/services/minio";

export function isPublicAvatarAddress(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b))
    || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

export function validateExternalAvatarUrl(value: string, origins: readonly string[]) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash
    || (url.port && url.port !== "443") || !origins.includes(url.origin)
    || isIP(url.hostname) || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("External avatar URL rejected");
  }
  return url;
}

export async function uploadExternalAvatar(input: {
  authorId: number; url: string; origins: readonly string[];
}) {
  const url = validateExternalAvatarUrl(input.url, input.origins);
  const resolver = new Resolver({ timeout: 2_000, tries: 1 });
  const addresses = await resolver.resolve4(url.hostname);
  if (!addresses.length || addresses.some((address) => !isPublicAvatarAddress(address))) throw new Error("Avatar address rejected");
  // Pin the checked address to the connection: a second DNS answer cannot redirect into the LAN.
  const body = await new Promise<Buffer>((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, family: 4,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0], 4),
      headers: { Accept: "image/jpeg, image/png, image/webp" },
    }, (response) => {
      if (response.statusCode !== 200 || !/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers["content-type"] ?? "")) {
        response.destroy(); reject(new Error("Avatar response rejected")); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > AVATAR_MAX_BYTES) { response.destroy(new Error("Avatar too large")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => req.destroy(new Error("Avatar timeout")), 8_000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  const image = await sharp(body, { limitInputPixels: AVATAR_MAX_INPUT_PIXELS })
    .rotate().resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover" }).webp().toBuffer();
  const objectKey = buildAuthorAvatarObjectKey(input.authorId);
  await uploadS3Object({ objectKey, body: image, contentType: "image/webp" });
  return objectKey;
}
