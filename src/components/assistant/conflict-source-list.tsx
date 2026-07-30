import { ExternalLink, FileText } from "lucide-react";

import type { GroundedCitation } from "@/lib/assistant/grounded-answer";

export function ConflictSourceList({
  citations,
}: {
  citations: GroundedCitation[];
}) {
  return (
    <div className="mt-4 space-y-2">
      {citations.map((citation, index) => {
        const content = (
          <>
            <div className="flex items-start gap-2">
              <FileText
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-warning"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-forest-950">
                  {citation.title}
                </span>
                <span className="mono mt-0.5 block break-all text-[10px] text-ink-600">
                  {citation.url ??
                    `知识快照 ${citation.contentUnitId ?? "身份不可用"}`}
                </span>
              </span>
              {citation.url ? (
                <ExternalLink
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-ink-400"
                />
              ) : null}
            </div>
            <blockquote className="mt-2 border-l-2 border-warning/40 pl-3 text-[12px] leading-5 text-ink-600">
              {citation.exactExcerpt}
            </blockquote>
          </>
        );
        const key = `${citation.contentUnitId ?? citation.knowledgeSourceId}-${index}`;

        return citation.url ? (
          <a
            className="block rounded-lg border border-warning/20 bg-card px-3 py-3 transition-colors hover:border-warning/40"
            href={citation.url}
            key={key}
            rel="noreferrer"
            target="_blank"
          >
            {content}
          </a>
        ) : (
          <div
            className="rounded-lg border border-warning/20 bg-card px-3 py-3"
            key={key}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
