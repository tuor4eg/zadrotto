import { notFound } from "next/navigation";
import Link from "next/link";
import { Layers3 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getTierListSettings, getTierTemplateById } from "@/db/queries/tier-lists";
import { SettingsSectionHeader } from "../../../../settings-section-header";
import { TierTemplateForm } from "../../../template-form";

export default async function EditTierTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template, { maxLevels }] = await Promise.all([getTierTemplateById(Number(id)), getTierListSettings()]);
  if (!template) notFound();
  return <div className="grid gap-5">
    <SettingsSectionHeader icon={<Layers3 />} title="Редактировать шаблон" description="Изменения применяются только к новым тир-листам." />
    <Link href="/admin/settings/tier-lists" className={buttonVariants({ variant: "outline", className: "w-fit" })}>К шаблонам</Link>
    <TierTemplateForm key={template.id} template={template} maxLevels={maxLevels} />
  </div>;
}
