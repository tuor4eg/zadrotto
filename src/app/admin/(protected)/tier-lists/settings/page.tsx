import { redirect } from "next/navigation";

export default function LegacyTierListSettingsPage() {
  redirect("/admin/settings/tier-lists");
}
