import { hasRequiredPersonalDataConsent } from "@/db/queries/personal-data-consent";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { PersonalDataConsentLayer } from "./personal-data-consent-layer";

export async function PersonalDataConsentGate() {
  const current = await getCurrentAuthorSession();
  const required = current ? !(await hasRequiredPersonalDataConsent(current.author.id)) : false;
  return <PersonalDataConsentLayer key={`${current?.author.id ?? "guest"}:${required}`} initialRequired={required} />;
}
