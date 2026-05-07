import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-stone-950 text-white hover:bg-stone-800",
        secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200",
        outline: "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:text-stone-950",
        ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-950",
        destructive: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        positive: "bg-emerald-700 text-white hover:bg-emerald-800",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
