import { RouteSwitch } from "@/components/ui/route-switch";

export function ArchiveSeriesDescendantsToggle({ checked, href }: { checked: boolean; href: string }) {
  return <RouteSwitch checked={checked} href={href} label="Серии внутри" />;
}
