import * as React from "react";

import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b border-line bg-card px-5 py-4 pr-18 sm:px-8 lg:pr-8",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-forest-950">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </header>
  );
}
