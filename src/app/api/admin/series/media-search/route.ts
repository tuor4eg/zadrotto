import { searchAdminMediaItemsAvailableForFranchise } from "@/db/queries/franchises";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const franchiseId = Number(params.get("franchiseId"));
  const query = params.get("q") ?? "";
  if (!Number.isInteger(franchiseId) || franchiseId < 1 || franchiseId > 2147483647 || query.length > 200) {
    return Response.json({ error: "Некорректные параметры поиска." }, { status: 400 });
  }

  return Response.json(await searchAdminMediaItemsAvailableForFranchise(franchiseId, query));
}
