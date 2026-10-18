import { getCreatorTypes, getCreatorOptions } from "@/db/queries/creators";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { PageHeader } from "../../admin-ui";
import { AdminToasts } from "../../admin-toasts";
import { CreatorForm } from "../creator-form";

export default async function NewCreatorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [query, types, series, creators] = await Promise.all([searchParams, getCreatorTypes(), getAdminFranchiseOptions(), getCreatorOptions()]);
  return <div className="grid gap-5"><PageHeader title="Добавить создателя" description="Имя, тип и связанные серии." />
    <AdminToasts clearParams={["error"]} messages={query.error ? [{ id: "error", tone: "error", text: "Не удалось создать создателя. Проверьте поля и уникальность slug." }] : []} />
    <CreatorForm types={types} series={series} creators={creators} />
  </div>;
}
