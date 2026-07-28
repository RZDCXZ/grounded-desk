"use client";

import * as React from "react";

import { useFieldControlProps } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Textarea({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  id,
  ...props
}: React.ComponentProps<"textarea">) {
  const fieldControlProps = useFieldControlProps({
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    disabled,
    id,
  });

  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-lg border border-input bg-muted px-3 py-2.5 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-ink-600 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-600 disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-light/30",
        className,
      )}
      data-slot="textarea"
      {...fieldControlProps}
      {...props}
    />
  );
}

export { Textarea };
