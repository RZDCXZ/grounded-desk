import { Slot } from "radix-ui";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "mono inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] leading-4 font-semibold whitespace-nowrap [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        neutral:
          "border-line bg-card text-ink-600 [--badge-accent:var(--ink-600)]",
        success:
          "border-success/20 bg-success-light text-ink-900 [--badge-accent:var(--success)]",
        processing:
          "border-processing/20 bg-processing-light text-ink-900 [--badge-accent:var(--processing)]",
        warning:
          "border-warning/20 bg-warning-light text-ink-900 [--badge-accent:var(--warning)]",
        danger:
          "border-danger/20 bg-danger-light text-ink-900 [--badge-accent:var(--danger)]",
        info: "border-info/20 bg-info-light text-ink-900 [--badge-accent:var(--info)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "span";

  return (
    <Component
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
