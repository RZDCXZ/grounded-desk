import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: "default" | "large";
};

export function BrandMark({
  className,
  size = "default",
}: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-lg bg-forest-950 text-white",
          size === "large" ? "size-10" : "size-8",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "border border-white",
            size === "large" ? "size-3" : "size-2.5",
          )}
        />
      </span>
      <span
        className={cn(
          "font-semibold tracking-[-0.02em] text-forest-950",
          size === "large" ? "text-lg" : "text-[16px]",
        )}
      >
        GroundedDesk
      </span>
    </div>
  );
}
