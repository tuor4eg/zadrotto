/** Switching a role preserves the archive context and always returns to its first page. */
export function buildCreatorArchiveHref(input:{
  creatorSlug:string; roleCode?:string; mediaType?:string; searchParams?:string;
}) {
  const params=new URLSearchParams(input.searchParams);
  params.set("creator",input.creatorSlug);
  params.delete("page");
  if(input.roleCode)params.set("creatorRole",input.roleCode);else params.delete("creatorRole");
  if(input.mediaType)params.set("type",input.mediaType);
  return `/archive?${params.toString()}`;
}
