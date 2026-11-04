"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { needsPersonalDataConsent } from "@/app/author/consent/actions";
import { PersonalDataConsentForm } from "./personal-data-consent-form";

export function PersonalDataConsentLayer({ initialRequired }: { initialRequired: boolean }) {
  const pathname = usePathname();
  const [required, setRequired] = useState(initialRequired);
  const dialog = useRef<HTMLDialogElement>(null);
  const excluded = pathname === "/consent" || pathname === "/author/consent" || pathname === "/privacy" || pathname.startsWith("/admin");
  useEffect(() => {
    if (excluded) return;
    let active = true;
    const refreshStatus = () => {
      void needsPersonalDataConsent().then((value) => { if (active) setRequired(value); }).catch(() => { /* Keep the last known consent requirement; server checks remain authoritative. */ });
    };
    refreshStatus();
    window.addEventListener("focus", refreshStatus);
    const timer = window.setInterval(refreshStatus, 30_000);
    return () => { active = false; window.removeEventListener("focus", refreshStatus); window.clearInterval(timer); };
  }, [pathname, excluded]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (required && !excluded && !element.open) element.showModal();
    else if ((!required || excluded) && element.open) element.close();
  }, [required, excluded]);
  if (!required || excluded) return null;
  return <dialog ref={dialog} onCancel={(event) => event.preventDefault()} aria-labelledby="personal-consent-heading" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl archive-paper-surface overflow-y-auto rounded-lg border border-stone-500/40 p-5 text-sm leading-6 text-stone-800 shadow-2xl backdrop:bg-stone-950/60 sm:p-7">
    <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-900">Гикотека · Аккаунт</p>
    <h2 id="personal-consent-heading" className="mb-5 font-semibold text-3xl leading-tight text-stone-950">Согласие на обработку персональных данных</h2>
    <PersonalDataConsentForm />
  </dialog>;
}
