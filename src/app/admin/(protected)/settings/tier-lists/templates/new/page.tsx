import Link from "next/link";
import { Layers3 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getTierListSettings } from "@/db/queries/tier-lists";
import { SettingsSectionHeader } from "../../../settings-section-header";
import { TierTemplateForm } from "../../template-form";

export default async function NewTierTemplatePage() {
  const { maxLevels } = await getTierListSettings();
  return <div className="grid gap-5">
    <SettingsSectionHeader icon={<Layers3 />} title="Новый шаблон тир-листа" description="Задайте названия, порядок и цвета уровней." />
    <Link href="/admin/settings/tier-lists" className={buttonVariants({ variant: "outline", className: "w-fit" })}>К шаблонам</Link>
    <TierTemplateForm maxLevels={maxLevels} />
  </div>;
}
