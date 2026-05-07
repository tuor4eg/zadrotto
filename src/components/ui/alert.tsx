import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-md border px-3 py-2 text-sm leading-6", {
  variants: {
    variant: {
      default: "border-stone-200 bg-stone-50 text-stone-600",
      success: "border-emerald-200 bg-emerald-50 text-emerald-700",
      destructive: "border-red-200 bg-red-50 text-red-700",
      warning: "border-amber-200 bg-amber-50 text-amber-800",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
