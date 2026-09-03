import { searchAdminMediaBrowser } from "@/db/queries/admin-media-browser";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { parseAdminMediaBrowserQuery } from "@/lib/admin/media-browser";

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const query = parseAdminMediaBrowserQuery(searchParams);

  return Response.json(await searchAdminMediaBrowser(query));
}
