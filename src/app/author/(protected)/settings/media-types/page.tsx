import { redirect } from "next/navigation";

export default function LegacyMediaTypeSettingsPage() {
  redirect("/author/profile/interests");
}
