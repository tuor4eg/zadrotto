import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { getPersonalDataConsentSettings } from "@/db/queries/personal-data-consent";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/privacy/consent";
import { revokeConsentAction, saveConsentSettingsAction } from "./actions";

export default async function ConsentSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; revoked?: string }> }) {
  await requireAdminUser();
  const [settings, params] = await Promise.all([getPersonalDataConsentSettings(), searchParams]);
  return <section className="max-w-2xl space-y-6 text-sm">
    <div><h2 className="text-xl font-semibold">Персональные данные</h2><p className="mt-2 text-stone-600">Версия согласия: {CURRENT_CONSENT_VERSION}. {settings.requireConsent ? <Link href="/consent" className="underline">Открыть документ и сведения об операторе</Link> : null}</p></div>
    {params.error ? <p role="alert" className="text-red-700">{params.error === "length" ? "Сократите сведения об операторе до 10 000 символов и контакт до 2 000 символов." : "Укажите корректный числовой ID автора и подтвердите отзыв."}</p> : null}
    {params.updated === "1" ? <p role="status">Сведения сохранены.</p> : null}
    {params.revoked === "1" ? <p role="status">Текущее согласие указанного автора отозвано, если оно существовало.</p> : null}
    <form action={saveConsentSettingsAction} className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
      <label className="flex items-start gap-2"><input name="requireConsent" type="checkbox" defaultChecked={settings.requireConsent} className="mt-1" /><span>Требовать согласие на обработку персональных данных</span></label>
      <p className="text-stone-600">По умолчанию требование выключено: регистрация и вход работают без подтверждения. При включении пользователям потребуется действующая версия согласия. История подтверждений сохраняется при переключении.</p>
      <label className="grid gap-2">Сведения об операторе<Textarea name="operatorDetails" maxLength={10000} defaultValue={settings.operatorDetails} /></label>
      <label className="grid gap-2">Контакт для обращений и отзыва<Textarea name="contact" maxLength={2000} defaultValue={settings.contact} /></label>
      <p className="text-stone-600">Укажите фактические данные. Пустые поля отображаются в документе как неопубликованные сведения.</p>
      <Button type="submit">Сохранить</Button>
    </form>
    <form action={revokeConsentAction} className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
      <h3 className="font-semibold">Отзыв согласия по обращению автора</h3>
      <label className="grid gap-2">Числовой ID автора<Input name="authorId" type="number" min={1} max={2147483647} step={1} required /></label>
      <label className="flex items-start gap-2"><input name="confirmed" type="checkbox" value="on" required className="mt-1" /><span>Подтверждаю отзыв согласия указанного автора.</span></label>
      <p className="text-stone-600">История согласий сохраняется. Сессии не завершаются: при включённом требовании следующее обращение к функциям аккаунта потребует нового согласия.</p>
      <Button type="submit" variant="outline">Отозвать текущее согласие</Button>
    </form>
  </section>;
}
