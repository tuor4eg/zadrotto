import { createBugReport } from "@/db/queries/bug-reports";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  BUG_REPORT_DESCRIPTION_MAX_LENGTH,
  BUG_REPORT_TIMEZONE_MAX_LENGTH,
  BUG_REPORT_URL_MAX_LENGTH,
  BUG_REPORT_USER_AGENT_MAX_LENGTH,
  BUG_REPORT_VIEWPORT_MAX_DIMENSION,
  isBugReportEntityType,
  type BugReportClientContext,
} from "@/lib/bug-reports/model";

function boundedDimension(value: unknown) {
  return typeof value === "number"
    && Number.isInteger(value)
    && value > 0
    && value <= BUG_REPORT_VIEWPORT_MAX_DIMENSION
      ? value
      : undefined;
}

function parseClientContext(value: unknown, userAgent: string | null): BugReportClientContext | null {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const timezone = typeof source.timezone === "string"
    ? source.timezone.trim().slice(0, BUG_REPORT_TIMEZONE_MAX_LENGTH)
    : "";
  const context: BugReportClientContext = {
    ...(timezone ? { timezone } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, BUG_REPORT_USER_AGENT_MAX_LENGTH) } : {}),
    ...(boundedDimension(source.viewportWidth) ? { viewportWidth: boundedDimension(source.viewportWidth) } : {}),
    ...(boundedDimension(source.viewportHeight) ? { viewportHeight: boundedDimension(source.viewportHeight) } : {}),
  };
  return Object.keys(context).length > 0 ? context : null;
}

function normalizeReportUrl(value: unknown, requestUrl: string) {
  if (typeof value !== "string" || !value.trim() || value.length > BUG_REPORT_URL_MAX_LENGTH) return null;
  try {
    const origin = new URL(requestUrl).origin;
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return null;
    if (parsed.pathname.startsWith("//")) return null;
    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relative.length <= BUG_REPORT_URL_MAX_LENGTH ? relative : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ error: "Требуется авторизация." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Некорректные данные." }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > BUG_REPORT_DESCRIPTION_MAX_LENGTH) {
    return Response.json({ error: "Описание должно содержать от 1 до 2000 символов." }, { status: 400 });
  }
  const url = normalizeReportUrl(body.url, request.url);
  if (!url) return Response.json({ error: "Некорректный адрес страницы." }, { status: 400 });

  const hasEntityType = body.entityType !== null && body.entityType !== undefined;
  const hasEntityId = body.entityId !== null && body.entityId !== undefined;
  if (hasEntityType !== hasEntityId) {
    return Response.json({ error: "Контекст страницы указан не полностью." }, { status: 400 });
  }
  let entityType = null;
  let entityId = null;
  if (hasEntityType && hasEntityId) {
    if (typeof body.entityType !== "string" || !isBugReportEntityType(body.entityType)) {
      return Response.json({ error: "Некорректный тип контекста." }, { status: 400 });
    }
    if (typeof body.entityId !== "string" || !body.entityId.trim() || body.entityId.length > 200) {
      return Response.json({ error: "Некорректный идентификатор контекста." }, { status: 400 });
    }
    entityType = body.entityType;
    entityId = body.entityId.trim();
  }

  const report = await createBugReport({
    authorId: author.id,
    clientContext: parseClientContext(body.clientContext, request.headers.get("user-agent")),
    description,
    entityId,
    entityType,
    url,
  });
  return Response.json({ id: report.id }, { status: 201 });
}
