import type { GameCompanyReference } from "@/lib/creators/game-companies";

type Company = {id?:number;name?:string;slug?:string;url?:string};
function valid(company: Company | undefined): company is Company & {id:number;name:string} {
  return Boolean(company && Number.isSafeInteger(company.id) && company.id! > 0 && company.name?.trim());
}
export function getIgdbCompanyReferences(values: Array<{developer?:boolean;publisher?:boolean;company?:Company}> | undefined): GameCompanyReference[] | undefined {
  if (values === undefined) return undefined;
  const result = new Map<string, GameCompanyReference>();
  for (const value of values) {
    if (!value.developer && !value.publisher) continue;
    if (!valid(value.company)) return undefined;
    for (const roleCode of ["developer","publisher"] as const) if (value[roleCode]) {
      const externalId = `company:${value.company.id}`;
      result.set(`${externalId}:${roleCode}`,{externalId,name:value.company.name.trim(),roleCode,...(value.company.url ? {sourceUrl:value.company.url}: {})});
    }
  }
  return [...result.values()];
}
export function getRawgCompanyReferences(details: {developers?:Company[];publishers?:Company[]}): GameCompanyReference[] | undefined {
  if (!Array.isArray(details.developers) || !Array.isArray(details.publishers)) return undefined;
  const result = new Map<string,GameCompanyReference>();
  for (const roleCode of ["developer","publisher"] as const) for (const company of roleCode === "developer" ? details.developers : details.publishers) {
    if (!valid(company)) return undefined;
    const externalId = `${roleCode}:${company.id}`;
    result.set(externalId,{externalId,name:company.name.trim(),roleCode,sourceUrl:`https://rawg.io/${roleCode === "developer" ? "developers" : "publishers"}/${company.slug ?? company.id}`});
  }
  return [...result.values()];
}
