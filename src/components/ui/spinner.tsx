import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  label = "正在加载",
  ...props
}: React.ComponentProps<typeof LoaderCircle> & { label?: string }) {
  return (
    <LoaderCircle
      aria-label={props["aria-hidden"] ? undefined : label}
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
      data-slot="spinner"
      role={props["aria-hidden"] ? undefined : "status"}
      {...props}
    />
  );
}

export { Spinner };
