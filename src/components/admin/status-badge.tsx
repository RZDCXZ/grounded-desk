import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

type Status =
  | "draft"
  | "published"
  | "offline"
  | "processing"
  | "available"
  | "failed"
  | "disabled"
  | "pending"
  | "resolved";

const statusPresentation: Record<
  Status,
  {
    label: string;
    variant: NonNullable<Parameters<typeof badgeVariants>[0]>["variant"];
    processing?: boolean;
  }
> = {
  draft: { label: "草稿", variant: "neutral" },
  published: { label: "已发布", variant: "success" },
  offline: { label: "已下线", variant: "neutral" },
  processing: { label: "处理中", variant: "processing", processing: true },
  available: { label: "可用", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  disabled: { label: "已停用", variant: "neutral" },
  pending: { label: "待处理", variant: "warning" },
  resolved: { label: "已解决", variant: "success" },
};

export function StatusBadge({ status }: { status: Status }) {
  const presentation = statusPresentation[status];

  return (
    <Badge variant={presentation.variant}>
      {presentation.processing ? (
        <Spinner aria-hidden="true" className="text-(--badge-accent)" />
      ) : (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-(--badge-accent)"
        />
      )}
      {presentation.label}
    </Badge>
  );
}

export function getStatusLabel(status: Status) {
  return statusPresentation[status].label;
}

export type { Status };
