import * as React from "react";

import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center p-8 text-center",
        className,
      )}
      data-slot="empty"
      {...props}
    />
  );
}

function EmptyMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full border border-line bg-muted text-primary [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      data-slot="empty-media"
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("mt-4 text-lg font-[650]", className)}
      data-slot="empty-title"
      {...props}
    />
  );
}

function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mt-1 max-w-100 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-4 flex items-center gap-2", className)}
      data-slot="empty-content"
      {...props}
    />
  );
}

export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
};
