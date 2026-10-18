import { getCreatorRoles } from "@/db/queries/creators";
import { PageHeader } from "../../admin-ui";
import { AdminToasts } from "../../admin-toasts";
import { CreatorDictionary } from "../creator-dictionary";

export default async function CreatorRolesPage({ searchParams }: { searchParams: Promise<{error?:string;updated?:string}> }) {
  const [query, rows] = await Promise.all([searchParams,getCreatorRoles()]);
  return <div className="grid gap-5"><PageHeader title="Роли создателей" description="Роли создателей в записях. Стабильный code используется в логике приложения."/>
    <AdminToasts clearParams={["error","updated"]} messages={query.error ? [{id:"error",tone:"error",text:"Не удалось сохранить изменения. Проверьте уникальность code; используемую роль удалить нельзя."}] : query.updated ? [{id:"updated",tone:"success",text:"Изменения сохранены."}] : []}/>
    <CreatorDictionary kind="role" rows={rows}/>
  </div>;
}
