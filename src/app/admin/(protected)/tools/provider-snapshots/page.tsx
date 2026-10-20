import { redirect } from "next/navigation";

export default async function LegacyProviderSnapshotsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  redirect(`/admin/tools/providers/snapshots${query.error === "invalid" ? "?error=invalid" : ""}`);
}
