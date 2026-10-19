import Image from "next/image";


export function PlatformLogo({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  const abbreviation=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>Array.from(part)[0]).join("").toUpperCase()||"?";
  return <span aria-label={`Платформа ${name}`} className="inline-flex shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white p-1.5" style={{ width: size, height: size }}>
    {logoUrl ? <Image src={logoUrl} alt={`Логотип ${name}`} width={size} height={size} unoptimized className="h-full w-full object-contain" /> : <span aria-hidden="true" className="font-serif text-xs font-semibold text-stone-600">{abbreviation}</span>}
  </span>;
}
