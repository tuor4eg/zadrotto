import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPlatformAssetRequestChoices } from "@/db/queries/platform-logo-requests";
import { PageHeader } from "../admin-ui";
import { PlatformRequestAutoRefresh } from "./auto-refresh";
import { PlatformRequestStatus } from "./presentation";
import { PlatformLogoChoiceForm } from "./logo-choice-form";
import { reopenPlatformAssetRequestAction, resolvePlatformAssetRequestAction, retryPlatformRequestAction } from "./actions";

export async function PlatformAssetRequestDetail({ id, error, saved }: { id: number; error?: string; saved?: string }) {
  const detail = await getPlatformAssetRequestChoices(id);
  if (!detail) return null;
  const { request, platform } = detail;
  const proposal = request.proposal;
  return <div className="grid gap-5">
    <PageHeader title={`Логотип: ${platform?.name ?? request.externalPlatformName}`}
      aside={<Link href="/admin/platform-requests" className={buttonVariants({ variant: "outline" })}>К заявкам</Link>} />
    <PlatformRequestAutoRefresh enabled={request.applyStatus === "applying"} />
    <PlatformRequestStatus status={request.applyStatus} />
    {error ? <p role="alert" className="text-sm text-red-700">Не удалось применить решение. Обновите страницу и выберите логотип ещё раз.</p> : null}
    {saved ? <p role="status" className="text-sm">Решение принято.</p> : null}
    {platform ? <Link href={`/admin/platforms/${platform.id}/edit`} className="text-sm underline">Открыть платформу</Link> : <p>Платформа удалена.</p>}
    {!request.superseded && request.decision === null && request.applyStatus === "pending" ? <PlatformLogoChoiceForm requestId={id}
      candidates={proposal?.candidates ?? []} selectedCandidateKey={proposal?.selectedCandidateKey} action={resolvePlatformAssetRequestAction} /> : null}
    {request.superseded ? <p className="text-sm">Этот набор изображений уже обновлён. Актуальный выбор доступен в редакторе платформы.</p> : null}
    {request.applyStatus === "applying" ? <p role="status" className="text-sm">Применяем выбранный логотип.</p> : null}
    {request.applyStatus === "failed" ? <div className="grid gap-2">
      <p role="alert" className="text-sm text-red-700">{request.jobError}</p>
      <form action={retryPlatformRequestAction}><input type="hidden" name="requestId" value={id} /><Button type="submit">Повторить применение</Button></form>
    </div> : null}
    {request.decision !== null && request.applyStatus !== "applying" ? <form action={reopenPlatformAssetRequestAction}>
      <input type="hidden" name="requestId" value={id} /><Button variant="outline" type="submit">Выбрать другой логотип</Button>
    </form> : null}
  </div>;
}
