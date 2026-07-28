import { Slot } from "radix-ui";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border text-sm font-medium transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground hover:brightness-[0.94]",
        secondary:
          "border-input bg-card text-foreground hover:bg-muted hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "border-danger bg-card text-danger hover:bg-danger-light",
        "destructive-confirm":
          "border-transparent bg-danger text-white hover:brightness-95",
      },
      size: {
        compact:
          "h-[34px] gap-1.5 px-3 has-data-[icon=inline-start]:pl-2.5 has-data-[icon=inline-end]:pr-2.5",
        default:
          "h-10 gap-2 px-4 has-data-[icon=inline-start]:pl-3.5 has-data-[icon=inline-end]:pr-3.5",
        large:
          "h-11 gap-2 px-5 has-data-[icon=inline-start]:pl-4 has-data-[icon=inline-end]:pr-4",
        icon: "size-10",
        "icon-large": "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  );
}

export { Button, buttonVariants };
