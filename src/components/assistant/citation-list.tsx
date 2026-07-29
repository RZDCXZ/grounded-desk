import { ExternalLink, FileText } from "lucide-react";

import type { GroundedCitation } from "@/lib/assistant/grounded-answer";

export function CitationList({
  citations,
}: {
  citations: GroundedCitation[];
}) {
  return (
    <div className="mt-4 border-t border-line pt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-ink-600">回答依据</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2 py-0.5 text-[10px] font-semibold text-success">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          有依据
        </span>
      </div>
      <div className="space-y-2">
        {citations.map((citation) =>
          citation.url ? (
            <a
              className="flex min-h-12 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-forest-800 transition-colors hover:border-line-strong hover:bg-forest-100/40"
              href={citation.url}
              key={citation.knowledgeSourceId}
              rel="noreferrer"
              target="_blank"
            >
              <FileText
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {citation.title}
                </span>
                <span className="mono mt-0.5 block truncate text-[10px] text-ink-600">
                  {citation.url}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
            </a>
          ) : (
            <div
              className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-ink-600"
              key={citation.knowledgeSourceId}
            >
              <FileText
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
              <span className="min-w-0 flex-1 truncate">{citation.title}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
