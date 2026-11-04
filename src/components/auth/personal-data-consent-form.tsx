"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptConsentAction, refuseConsentAction } from "@/app/author/consent/actions";
import { Button } from "@/components/ui/button";
import { CURRENT_CONSENT_VERSION } from "@/lib/privacy/consent";

export function PersonalDataConsentForm() {
  const [error, action, pending] = useActionState(acceptConsentAction, null);
  return (
    <form action={action} className="space-y-5 text-sm leading-6 text-stone-700">
      <p>Для использования аккаунта необходимо согласие на обработку персональных данных. Без согласия можно продолжить просмотр публичного архива после выхода.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-red-900">
        <Link href="/consent" className="underline underline-offset-4 hover:text-red-700">Прочитать согласие</Link>
        <Link href="/privacy" className="underline underline-offset-4 hover:text-red-700">Политика конфиденциальности</Link>
      </div>
      <input name="version" type="hidden" value={CURRENT_CONSENT_VERSION} />
      <label className="flex items-start gap-3 rounded-md border border-stone-500/25 bg-stone-50/40 p-3 sm:p-4">
        <input name="accepted" type="checkbox" value="yes" required className="mt-1 size-4 shrink-0 accent-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900" />
        <span>Я ознакомился с <Link href="/consent" className="underline underline-offset-4 hover:text-red-900">согласием на обработку персональных данных</Link> (версия {CURRENT_CONSENT_VERSION}) и даю согласие.</span>
      </label>
      {error ? <p role="alert" className="text-red-800">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 border-t border-stone-500/25 pt-5">
        <Button type="submit" formAction={refuseConsentAction} formNoValidate variant="outline" disabled={pending} className="w-full border-stone-500/40 bg-stone-50/50 px-2">Отказываюсь</Button>
        <Button type="submit" disabled={pending} className="w-full bg-red-900 px-2 hover:bg-red-800">{pending ? "Сохраняем…" : "Принимаю"}</Button>
      </div>
    </form>
  );
}
