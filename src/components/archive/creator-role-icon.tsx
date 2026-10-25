import { Building2, Clapperboard, Code2, Dices, Drama, Feather, Lightbulb, Palette, ScrollText, Tv, UserRound, type LucideIcon } from "lucide-react";

const CREATOR_ROLE_ICONS: Record<string, LucideIcon> = {
  writer: Feather,
  designer: Dices,
  artist: Palette,
  developer: Code2,
  publisher: Building2,
  director: Clapperboard,
  actor: Drama,
  screenwriter: ScrollText,
  network: Tv,
  production_company: Clapperboard,
  creator: Lightbulb,
};

export function CreatorRoleIcon({ code, className }: { code: string; className?: string }) {
  const Icon = CREATOR_ROLE_ICONS[code] ?? UserRound;
  return <Icon aria-hidden="true" className={className} />;
}
