import { canViewMediaItemCover } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { fetchS3Object } from "@/lib/services/minio";

const INTERNAL_COVER_PATH = "/_protected-covers";

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

function getInternalCoverPath(segments: string[]) {
  return `${INTERNAL_COVER_PATH}/${segments.map(encodeURIComponent).join("/")}`;
}

export async function GET(_request: Request, { params }: CoverRouteContext) {
  const { objectKey: segments } = await params;
  const objectKey = getSafeCoverObjectKey(segments);

  if (!objectKey) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  const [currentAuthor, adminUser] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()]);
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(currentAuthor?.id);
  const canViewCover = await canViewMediaItemCover(
    objectKey,
    accessibleMediaTypeCodes,
    currentAuthor ?? undefined,
    { isAdmin: Boolean(adminUser) },
  );

  if (!canViewCover) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  if (process.env.NODE_ENV === "development") {
    const s3Response = await fetchS3Object({ objectKey });

    if (!s3Response?.body) {
      return new Response("Обложка не найдена.", { status: 404 });
    }

    return new Response(s3Response.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": s3Response.headers.get("content-type") ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(null, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Accel-Redirect": getInternalCoverPath(segments),
    },
  });
}
