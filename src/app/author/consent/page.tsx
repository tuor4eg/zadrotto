import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { PersonalDataConsentForm } from "@/components/auth/personal-data-consent-form";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { hasRequiredPersonalDataConsent } from "@/db/queries/personal-data-consent";

export default async function AuthorConsentPage() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  if (await hasRequiredPersonalDataConsent(current.author.id)) redirect("/author");
  return (
    <main className="archive-page flex min-h-dvh flex-1 flex-col px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6">
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>К архиву</Link>
        <section className="archive-paper-surface rounded-lg border border-stone-500/40 p-5 shadow-lg sm:p-7" aria-labelledby="consent-heading">
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-900">Гикотека · Аккаунт</p>
          <h1 id="consent-heading" className="mb-5 font-semibold text-3xl leading-tight sm:text-4xl">Согласие на обработку персональных данных</h1>
          <PersonalDataConsentForm />
        </section>
      </div>
    </main>
  );
}
