import { getCollectionSettings } from "@/db/queries/collection-settings";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getAdminMediaBrowserFilterOptions } from "@/db/queries/admin-media-browser";
import { PageHeader } from "../../admin-ui";
import { createCollectionAction } from "../actions";
import { CollectionForm } from "../collection-form";

export default async function NewCollectionPage() {
  const [{ mediaTypes, series }, limits] = await Promise.all([getAdminMediaBrowserFilterOptions(), getCollectionSettings()]);
  return <div className="grid gap-5"><PageHeader title="Новая подборка" aside={<Link className={buttonVariants({ variant: "outline" })} href="/admin/collections"><ArrowLeft />К списку</Link>} /><CollectionForm limits={limits} action={createCollectionAction} mediaTypes={mediaTypes} series={series} /></div>;
}
