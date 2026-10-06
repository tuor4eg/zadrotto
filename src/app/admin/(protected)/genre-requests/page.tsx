import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getGenreRequests } from "@/db/queries/genre-requests";
import { buttonVariants } from "@/components/ui/button";
import { AdminToasts } from "../admin-toasts";
import { PageHeader } from "../admin-ui";
import { GenreRequestAutoRefresh } from "./auto-refresh";
import { GenreRequestsList } from "./request-list";
import { genreRequestError } from "./presentation";

export default async function GenreRequestsPage({ searchParams }: { searchParams: Promise<{ all?: string; error?: string }> }) {
  await requireAdminUser();
  const query = await searchParams;
  const all = query.all === "1";
  const requests = await getGenreRequests({ all });
  const error = genreRequestError(query.error);
  return <div className="grid gap-5">
    <PageHeader title="Заявки на жанры" description="Неизвестные жанры провайдеров, ожидающие решения." />
    <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
    <GenreRequestAutoRefresh enabled={requests.some((request) => request.status === "applying")} />
    <nav aria-label="Список заявок" className="flex flex-wrap gap-2">
      <Link href="/admin/genre-requests" aria-current={!all ? "page" : undefined} className={buttonVariants({ variant: !all ? "default" : "outline", size: "sm" })}>Ожидают решения</Link>
      <Link href="/admin/genre-requests?all=1" aria-current={all ? "page" : undefined} className={buttonVariants({ variant: all ? "default" : "outline", size: "sm" })}>Все заявки</Link>
    </nav>
    <GenreRequestsList requests={requests} all={all} />
  </div>;
}
