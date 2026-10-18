import { Clapperboard, Dices, Drama, Feather, Palette, ScrollText, UserRound, type LucideIcon } from "lucide-react";

const CREATOR_ROLE_ICONS: Record<string, LucideIcon> = {
  writer: Feather,
  designer: Dices,
  artist: Palette,
  director: Clapperboard,
  actor: Drama,
  screenwriter: ScrollText,
};

export function CreatorRoleIcon({ code, className }: { code: string; className?: string }) {
  const Icon = CREATOR_ROLE_ICONS[code] ?? UserRound;
  return <Icon aria-hidden="true" className={className} />;
}
