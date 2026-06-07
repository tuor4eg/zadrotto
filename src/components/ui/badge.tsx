import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/common/utils";

export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-stone-200 bg-stone-100 text-stone-700",
        outline: "border-stone-200 bg-white text-stone-600",
        positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        destructive: "border-red-200 bg-red-50 text-red-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
