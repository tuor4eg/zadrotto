import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getGenreRequests } from "@/db/queries/genre-requests";
import { AdminToasts } from "../admin-toasts";
import { PageHeader } from "../admin-ui";
import { GenreRequestsList } from "./request-list";
import { genreRequestError } from "./presentation";

export default async function GenreRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdminUser();
  const query = await searchParams;
  const requests = await getGenreRequests();
  const error = genreRequestError(query.error);
  return <div className="grid gap-5">
    <PageHeader title="Заявки на жанры" description="Неизвестные жанры провайдеров, ожидающие решения." />
    <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
    <GenreRequestsList requests={requests} />
  </div>;
}
