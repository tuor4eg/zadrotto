import { cookies } from "next/headers";

import { canViewMediaItemCover } from "@/db/queries/media-items";
import { AUTHOR_SESSION_COOKIE_NAME, verifyAuthorSessionToken } from "@/lib/author-session";
import { fetchS3Object } from "@/lib/storage";

type CoverRouteContext = {
  params: Promise<{
    objectKey: string[];
  }>;
};

function getSafeCoverObjectKey(segments: string[]) {
  if (segments.length === 0) {
    return null;
  }

  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

async function getCurrentAuthorFromSession() {
  const token = (await cookies()).get(AUTHOR_SESSION_COOKIE_NAME)?.value;
  const payload = token ? verifyAuthorSessionToken(token) : null;

  return payload?.type === "author"
    ? { id: payload.authorId, code: payload.authorCode }
    : undefined;
}

export async function GET(_request: Request, { params }: CoverRouteContext) {
  const { objectKey: segments } = await params;
  const objectKey = getSafeCoverObjectKey(segments);

  if (!objectKey) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  const currentAuthor = await getCurrentAuthorFromSession();
  const canViewCover = await canViewMediaItemCover(objectKey, currentAuthor);

  if (!canViewCover) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  const s3Response = await fetchS3Object({ objectKey });

  if (!s3Response?.body) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  return new Response(s3Response.body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": s3Response.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}
