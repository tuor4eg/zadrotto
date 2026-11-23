import { getCreatorTypes } from "@/db/queries/creators";
import { PageHeader } from "../../admin-ui";
import { AdminToasts } from "../../admin-toasts";
import { creatorEditErrorMessage } from "@/lib/creators/editor";
import { CreatorForm } from "../creator-form";

export default async function NewCreatorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [query, types] = await Promise.all([searchParams, getCreatorTypes()]);
  return <div className="grid gap-5"><PageHeader title="Добавить создателя" description="Имя, тип и псевдонимы." />
    <AdminToasts clearParams={["error"]} messages={query.error ? [{ id: "error", tone: "error", text: creatorEditErrorMessage(query.error) }] : []} />
    <CreatorForm types={types} creators={[]} />
  </div>;
}
