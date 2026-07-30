import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  GitCompare,
  MessageCircle,
  ServerCrash,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import type { ConversationResultType } from "@/lib/assistant/conversation-result";
import { cn } from "@/lib/utils";

export type ConversationReviewResultType =
  | ConversationResultType
  | "technical_failure";

type ResultPresentation = {
  className: string;
  icon: LucideIcon;
  label: string;
};

const resultPresentations: Record<
  ConversationReviewResultType,
  ResultPresentation
> = {
  grounded_answer: {
    className: "border-success/20 bg-success-light text-success",
    icon: CheckCircle2,
    label: "有据回答",
  },
  knowledge_conflict: {
    className: "border-warning/20 bg-warning-light text-warning",
    icon: GitCompare,
    label: "知识冲突",
  },
  conversational_response: {
    className: "border-line bg-paper text-ink-600",
    icon: MessageCircle,
    label: "交流性回应",
  },
  clarification_request: {
    className: "border-info/20 bg-info-light text-info",
    icon: CircleHelp,
    label: "澄清提问",
  },
  grounded_refusal: {
    className: "border-warning/20 bg-warning-light text-warning",
    icon: AlertTriangle,
    label: "可靠拒答",
  },
  human_handoff: {
    className: "border-info/20 bg-info-light text-info",
    icon: UserCheck,
    label: "人工接续",
  },
  technical_failure: {
    className: "border-danger/20 bg-danger-light text-danger",
    icon: ServerCrash,
    label: "技术故障",
  },
};

const pendingResultPresentation: ResultPresentation = {
  className: "border-line bg-paper text-ink-600",
  icon: Clock3,
  label: "等待回答",
};

export function ConversationResultBadge({
  resultType,
}: {
  resultType: ConversationReviewResultType | null;
}) {
  const presentation = resultType
    ? resultPresentations[resultType]
    : pendingResultPresentation;
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        "mono inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold",
        presentation.className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {presentation.label}
    </span>
  );
}
