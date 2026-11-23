import { searchAdminMediaBrowser, searchMediaBrowserCreators } from "@/db/queries/admin-media-browser";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { parseAdminMediaBrowserQuery } from "@/lib/admin/media-browser";

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("suggest") === "creators") {
    return Response.json(await searchMediaBrowserCreators(searchParams.get("q") ?? ""));
  }
  const query = parseAdminMediaBrowserQuery(searchParams);

  if (searchParams.get("scope") === "entry-sources") {
    return Response.json(await searchAdminMediaBrowser(query, undefined, { includeUnpublished: true }));
  }

  return Response.json(await searchAdminMediaBrowser(query));
}
