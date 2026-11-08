import { Button } from "@/components/ui/button";

export function YandexIdButton({ label }: { label: string }) {
  return (
    <Button
      type="submit"
      variant="secondary"
      aria-label={label}
      className="relative h-12 w-full rounded-full bg-[#efefef] px-12 text-base font-semibold text-black hover:bg-[#e5e5e5]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute left-4 size-6!">
        <circle cx="12" cy="12" r="11" fill="#fc3f1d" />
        <path fill="#fff" d="M13.14 6h-1.12c-2.06 0-3.14 1.04-3.14 2.58 0 1.75.75 2.56 2.29 3.6l1.27.85L8.79 18H6.15l3.28-4.68c-1.89-1.35-2.95-2.66-2.95-4.59C6.48 6.15 8.27 4.5 12 4.5h3.55V18h-2.41V6Z" />
      </svg>
      Яндекс ID
    </Button>
  );
}
