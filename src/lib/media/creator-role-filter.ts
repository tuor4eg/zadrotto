/** Switching a role or media type preserves context and returns to the first page. */
export function buildCreatorArchiveHref(input:{
  creatorSlug:string; roleCode?:string; scope?:"works"; mediaType?:string; searchParams?:string;
}) {
  const params=new URLSearchParams(input.searchParams);
  params.set("creator",input.creatorSlug);
  params.delete("page");
  if(input.roleCode)params.set("creatorRole",input.roleCode);else params.delete("creatorRole");
  if(input.scope === "works") {
    params.delete("creatorRole");
    params.set("creatorScope", "works");
  } else {
    params.delete("creatorScope");
  }
  if(input.mediaType === "all") params.delete("type");
  else if(input.mediaType)params.set("type",input.mediaType);
  return `/archive?${params.toString()}`;
}
