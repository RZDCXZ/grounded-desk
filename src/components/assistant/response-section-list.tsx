import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  GitCompare,
  UserCheck,
} from "lucide-react";

import { CitationList } from "@/components/assistant/citation-list";
import { ConflictSourceList } from "@/components/assistant/conflict-source-list";
import { ControlledMarkdown } from "@/components/assistant/controlled-markdown";
import type {
  ResponseSection,
  ResponseSectionStatus,
} from "@/lib/assistant/response-sections";
import { cn } from "@/lib/utils";

const statusPresentation: Record<
  ResponseSectionStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
  }
> = {
  supported: {
    label: "已回答",
    icon: CheckCircle2,
    className: "border-success/25 bg-success-light/40 text-success",
  },
  unsupported: {
    label: "暂无法确认",
    icon: AlertTriangle,
    className: "border-warning/25 bg-warning-light/50 text-warning",
  },
  conflicting: {
    label: "知识存在冲突",
    icon: GitCompare,
    className: "border-warning/25 bg-warning-light/50 text-warning",
  },
  conversational: {
    label: "已回答",
    icon: CheckCircle2,
    className: "border-success/25 bg-success-light/40 text-success",
  },
  clarification: {
    label: "需要补充信息",
    icon: CircleHelp,
    className: "border-info/25 bg-info-light/50 text-info",
  },
  handoff: {
    label: "需要人工协助",
    icon: UserCheck,
    className: "border-info/25 bg-info-light/50 text-info",
  },
};

export function ResponseSectionList({
  sections,
}: {
  sections: ResponseSection[];
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const presentation = statusPresentation[section.status];
        const StatusIcon = presentation.icon;

        return (
          <section
            aria-labelledby={`response-section-${section.id}`}
            className="rounded-lg border border-line bg-card p-4"
            key={section.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3
                className="text-[13px] font-semibold text-forest-950"
                id={`response-section-${section.id}`}
              >
                {section.title ?? `事实诉求 ${section.order}`}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  presentation.className,
                )}
              >
                <StatusIcon aria-hidden="true" className="size-3" />
                {presentation.label}
              </span>
            </div>

            <div className="mt-3 text-[13px] leading-6 text-ink-700">
              <ControlledMarkdown>{section.content}</ControlledMarkdown>
            </div>

            {section.status === "supported" ? (
              <CitationList citations={section.citations} />
            ) : section.status === "conflicting" ? (
              <ConflictSourceList citations={section.citations} />
            ) : null}

            {(section.status === "handoff" ||
              section.status === "unsupported") &&
            section.contact ? (
              <a
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-info/30 bg-card px-3 text-[13px] font-medium text-info transition-colors hover:bg-info-light"
                href={section.contact.url}
                rel="noreferrer"
                target="_blank"
              >
                {section.contact.label}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
