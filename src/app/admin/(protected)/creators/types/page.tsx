import { getCreatorTypes } from "@/db/queries/creators";
import { PageHeader } from "../../admin-ui";
import { AdminToasts } from "../../admin-toasts";
import { CreatorDictionary } from "../creator-dictionary";

export default async function CreatorTypesPage({ searchParams }: { searchParams: Promise<{error?:string;updated?:string}> }) {
  const [query, rows] = await Promise.all([searchParams,getCreatorTypes()]);
  return <div className="grid gap-5"><PageHeader title="Типы создателей" description="Типы людей и организаций. Стабильный code используется в логике приложения."/>
    <AdminToasts clearParams={["error","updated"]} messages={query.error ? [{id:"error",tone:"error",text:"Не удалось сохранить изменения. Проверьте уникальность code; используемый тип удалить нельзя."}] : query.updated ? [{id:"updated",tone:"success",text:"Изменения сохранены."}] : []}/>
    <CreatorDictionary kind="type" rows={rows}/>
  </div>;
}
