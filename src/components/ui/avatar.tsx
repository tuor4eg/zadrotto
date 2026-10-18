import { cn } from "@/lib/common/utils";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function getAvatarSrc(objectKey: string) {
  return `/${objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function Avatar({
  name,
  objectKey,
  src,
  className,
}: {
  name: string;
  objectKey?: string | null;
  src?: string | null;
  className?: string;
}) {
  const imageSrc = src || (objectKey ? getAvatarSrc(objectKey) : null);

  return (
    <span
      className={cn(
        "relative inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-stone-800 font-serif text-sm font-semibold text-stone-50",
        className,
      )}
      aria-label={`Аватар автора ${name}`}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}
