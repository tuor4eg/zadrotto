import Link from "next/link";
import { getPlatformAssetEditorState } from "@/db/queries/platform-logo-requests";

export async function PlatformAssetState({ platformId }: { platformId: number }) {
  const { requests } = await getPlatformAssetEditorState(platformId);
  const logoRequests = requests.filter(request => request.kind === "logo" && !request.superseded);
  return <section className="grid gap-3">
    <h2 className="text-sm font-medium">Выбор логотипа</h2>
    {logoRequests.length ? <ul className="grid gap-2">{logoRequests.map(request => <li key={request.id} className="text-sm">
      <Link href={`/admin/platform-requests/${request.id}`} className="underline">{request.name}</Link>
      <span className="ml-2 text-xs text-stone-500">{request.decision === "exclude" ? "Без логотипа" : request.status === "processed" ? "Выбран" : request.status === "failed" ? "Ошибка" : request.status === "applying" ? "Применяется" : "Выберите изображение"}</span>
    </li>)}</ul> : <p className="text-sm text-stone-500">Чтобы получить варианты, обновите логотип у провайдера.</p>}
  </section>;
}
