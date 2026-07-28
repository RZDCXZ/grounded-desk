"use client";

import * as React from "react";

import { useFieldControlProps } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Input({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  id,
  type,
  ...props
}: React.ComponentProps<"input">) {
  const fieldControlProps = useFieldControlProps({
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    disabled,
    id,
  });

  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-600 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-600 disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-light/30",
        className,
      )}
      data-slot="input"
      type={type}
      {...fieldControlProps}
      {...props}
    />
  );
}

export { Input };
