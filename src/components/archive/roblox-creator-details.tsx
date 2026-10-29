import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";

export function RobloxCreatorDetails({ creators = [], facts, separatorBefore = false }: {
  creators?: readonly { id?: number | null; name: string; slug?: string | null; roleCode: string }[];
  facts?: Record<string, unknown> | null;
  separatorBefore?: boolean;
}) {
  const developers = creators.filter(creator => creator.roleCode === "developer");
  const legacyName = typeof facts?.creatorName === "string" ? facts.creatorName.trim() : "";
  const names = developers.length ? developers : legacyName ? [{ name: legacyName }] : [];
  if (!names.length) return null;
  return <>{separatorBefore ? <span className="mx-1.5" aria-hidden="true">•</span> : null}
    <span className="break-words"><span className="text-stone-500">Разработчик: </span><MediaItemCreatorLinks creators={names} mediaType="roblox" /></span>
  </>;
}
