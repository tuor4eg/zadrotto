import { searchEntrySourceOptions } from "@/db/queries/entry-sources";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { isEntrySourceType, parseEntrySourceId } from "@/lib/media/entry-sources";

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "";
  const rawEntryId = params.get("entry");
  const entryId = parseEntrySourceId(rawEntryId);
  const query = params.get("q") ?? "";
  const rawExcludedTagId = params.get("excludeTag");
  const excludedTagId = parseEntrySourceId(rawExcludedTagId);
  const excludedIds = params.getAll("exclude").map(parseEntrySourceId);
  if (!isEntrySourceType(type) || (entryId === null && (rawEntryId !== null || type !== "entry")) ||
      (rawExcludedTagId !== null && (type !== "entry" || excludedTagId === null)) ||
      query.length > 200 || excludedIds.some((id) => id === null)) {
    return Response.json({ error: "Некорректные параметры поиска." }, { status: 400 });
  }

  return Response.json({
    items: await searchEntrySourceOptions(type, query, entryId, excludedIds.filter((id) => id !== null), excludedTagId ?? undefined),
  });
}
