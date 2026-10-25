import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getCreatorProfileSnapshot } from "@/db/queries/creator-profile-snapshots";
import { parseCreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import { SnapshotJsonViewer } from "@/components/admin/snapshot-json-viewer";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { attachCreatorProfileSnapshotAction } from "../actions";

export default async function ProfileSnapshotPage({ searchParams }: { searchParams: Promise<{ provider?: string; resourceType?: string; externalId?: string }> }) {
  await requireAdminUser();
  const query = await searchParams;
  let target;
  try { target = parseCreatorProfileTarget(query); } catch { notFound(); }
  const snapshot = await getCreatorProfileSnapshot(target);
  return <main className="space-y-4">
    <Link className="underline" href="/admin/tools/providers/snapshots">Снимки провайдеров</Link>
    <h1 className="text-2xl font-semibold">Исходный профиль: {target.provider} · {target.resourceType} · {target.externalId}</h1>
    {!snapshot ? <Alert>Сохранённого профиля пока нет. Дождитесь завершения загрузки или проверьте журнал задач.</Alert> : <>
      <details className="rounded-md border p-4"><summary className="cursor-pointer font-semibold">Посмотреть полный ответ</summary><SnapshotJsonViewer value={snapshot.payload} /></details>
      <form action={attachCreatorProfileSnapshotAction} className="grid max-w-xl gap-3 rounded-md border p-4">
        <h2 className="font-semibold">Связать с Creator</h2>
        <p className="text-sm text-stone-600">Нужна подтверждённая привязка к этому внешнему профилю. Рабочие данные создателя не изменяются.</p>
        <input type="hidden" name="snapshotId" value={snapshot.id} /><input type="hidden" name="payloadHash" value={snapshot.payloadHash} />
        <Label htmlFor="attach-creator">ID создателя</Label><Input id="attach-creator" name="creatorId" type="number" min="1" required />
        <Button className="w-fit">Связать с Creator</Button>
      </form>
    </>}
  </main>;
}
