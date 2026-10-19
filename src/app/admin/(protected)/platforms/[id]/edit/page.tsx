import { reopenPlatformMappingAction } from "../../actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminPlatformById } from "@/db/queries/platforms";
import { parsePlatformId } from "@/lib/media/admin-platforms";
import { PageHeader } from "../../../admin-ui";
import { updatePlatformNameAction } from "../../actions";
import { PlatformAssetState } from "../../asset-state";
import { PlatformLogoEditor } from "../../logo-editor";
import { PlatformForm } from "../../platform-form";
import { getPlatformErrorMessage } from "../../messages";
import { PlatformProviderVariants } from "../../provider-variants";

export default async function EditPlatformPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string; logoError?: string; logoUpdated?: string }>;
}) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = parsePlatformId(rawId);
  if (id === null) notFound();
  const platform = await getAdminPlatformById(id);
  if (!platform) notFound();
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <PageHeader title="Редактирование платформы" description={platform.name} aside={
        <Link href={"/admin/platforms"} className={buttonVariants({ variant: "outline" })}><ArrowLeft />Назад</Link>
      } />
      {!platform.isActive ? <div><Badge variant="warning">Неактивна</Badge></div> : null}
      <Card><CardContent className="pt-5">
        <PlatformForm key={platform.id} platform={platform} action={updatePlatformNameAction} errorMessage={getPlatformErrorMessage(query.error)} updated={query.updated === "1"} />
      </CardContent></Card>
      <Card><CardContent className="pt-5"><PlatformLogoEditor platform={platform} error={query.logoError === "1"} updated={query.logoUpdated === "1"} /></CardContent></Card>
      <Card><CardContent className="pt-5"><PlatformAssetState platformId={id} /></CardContent></Card>
      <Card><CardContent className="grid gap-3 pt-5">
        <h3 className="text-sm font-medium text-stone-950">Варианты у провайдеров</h3>
        <PlatformProviderVariants groups={platform.providerVariants} reopenAction={reopenPlatformMappingAction} />
      </CardContent></Card>
    </div>
  );
}
