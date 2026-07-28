import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "grid w-full gap-1 rounded-lg border p-3 text-left text-[13px] has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 [&>svg]:row-span-2 [&>svg]:mt-0.5 [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        neutral: "border-line bg-card text-foreground",
        success: "border-success/20 bg-success-light text-success",
        danger: "border-danger/20 bg-danger-light text-danger",
        info: "border-info/20 bg-info-light text-info",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Alert({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-semibold", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("leading-5", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
