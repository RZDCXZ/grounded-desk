import { ExternalLink, FileText, LoaderCircle } from "lucide-react";

import { requireAdministrator } from "@/lib/auth/require-admin";

import { AddKnowledgeSource } from "./knowledge-sources-client";
import { ProcessingStatusRefresh } from "./processing-status-refresh";

const sourceStatus = {
  processing: {
    label: "处理中",
    className: "bg-(--processing-light) text-(--processing)",
  },
  available: {
    label: "可用",
    className: "bg-(--success-light) text-(--success)",
  },
  failed: {
    label: "失败",
    className: "bg-(--danger-light) text-(--danger)",
  },
  disabled: {
    label: "已停用",
    className: "bg-(--paper) text-(--ink-400)",
  },
} as const;

type KnowledgeSource = {
  id: string;
  title: string;
  source_type: string;
  original_url: string | null;
  status: keyof typeof sourceStatus;
  failure_reason: string | null;
  current_revision_id: string | null;
  updated_at: string;
};

export default async function KnowledgeSourcesPage() {
  const { supabase, organization } = await requireAdministrator();
  const { data } = await supabase
    .from("knowledge_sources")
    .select(
      "id, title, source_type, original_url, status, failure_reason, current_revision_id, updated_at",
    )
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false });
  const sources = (data ?? []) as KnowledgeSource[];
  const hasProcessingSources = sources.some(
    ({ source_type: sourceType, status }) =>
      sourceType === "manual" && status === "processing",
  );

  return (
    <main className="page-enter min-h-screen">
      {hasProcessingSources ? <ProcessingStatusRefresh /> : null}

      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b border-(--line) bg-white px-5 py-4 sm:px-8">
        <div>
          <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-(--forest-950)">
            知识来源
          </h1>
          <p className="text-sm text-(--ink-600)">
            管理助手回答所依赖的业务知识与处理状态
          </p>
        </div>
        <AddKnowledgeSource />
      </header>

      <div className="mx-auto max-w-300 p-5 sm:p-8">
        <section className="overflow-hidden rounded-xl border border-(--line) bg-white">
          {sources.length === 0 ? (
            <EmptyKnowledgeSources />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-220 border-collapse text-left">
                <thead className="border-b border-(--line) bg-(--paper)">
                  <tr className="mono text-[11px] font-semibold text-(--ink-400)">
                    <th className="px-6 py-4">标题与类型</th>
                    <th className="px-6 py-4">原始地址 / 来源</th>
                    <th className="px-6 py-4">状态</th>
                    <th className="px-6 py-4">当前版本</th>
                    <th className="px-6 py-4">最近更新</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--line) text-[13px]">
                  {sources.map((source) => (
                    <KnowledgeSourceRow key={source.id} source={source} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyKnowledgeSources() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-(--line) bg-(--paper) text-(--forest-800)">
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">还没有知识来源</h2>
      <p className="mt-1 max-w-100 text-[13px] text-(--ink-600)">
        添加一项手工知识来源，处理完成后即可用于有据回答。
      </p>
    </div>
  );
}

function KnowledgeSourceRow({ source }: { source: KnowledgeSource }) {
  const status = sourceStatus[source.status];

  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText
            className="size-5 shrink-0 text-(--forest-800)"
            strokeWidth={1.7}
          />
          <div>
            <p className="font-medium text-(--ink-900)">{source.title}</p>
            <p className="mono mt-0.5 text-[10px] text-(--ink-400)">
              {source.source_type === "manual" ? "手工内容" : "公开网页"}
            </p>
          </div>
        </div>
      </td>
      <td className="max-w-70 px-6 py-4 text-(--ink-600)">
        {source.original_url ? (
          <a
            className="mono inline-flex max-w-full items-center gap-1 text-xs text-(--forest-800) hover:underline"
            href={source.original_url}
            rel="noreferrer"
            target="_blank"
          >
            <span className="truncate">{source.original_url}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          "手工录入内容"
        )}
      </td>
      <td className="px-6 py-4">
        <span
          className={`mono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
        >
          {source.status === "processing" ? (
            <LoaderCircle
              className="size-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {status.label}
        </span>
        {source.failure_reason ? (
          <p className="mt-1 max-w-68 text-[11px] leading-4 text-(--danger)">
            {source.failure_reason}
          </p>
        ) : null}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-400)">
        {source.current_revision_id ? "v1" : "—"}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-400)">
        {formatUpdatedAt(source.updated_at)}
      </td>
    </tr>
  );
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
