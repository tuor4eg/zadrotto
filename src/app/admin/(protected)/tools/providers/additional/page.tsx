import { Alert } from "@/components/ui/alert";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { ProfileTargetForm } from "../snapshots/profile-target-form";

export default async function AdditionalProviderToolsPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminUser();
  const query = await searchParams;

  return <section className="grid gap-5">
    <div className="space-y-1">
      <h2 className="font-serif text-2xl">Дополнительно</h2>
      <p className="text-sm leading-6 text-stone-600">Служебные инструменты для проверки внешних профилей и предварительного получения данных.</p>
    </div>
    {query.error === "invalid" && <Alert variant="destructive" role="alert">Не удалось запустить загрузку профиля. Проверьте параметры и повторите попытку.</Alert>}
    <ProfileTargetForm />
  </section>;
}
