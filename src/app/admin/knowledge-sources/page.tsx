import { ExternalLink, FileText, Globe } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  StatusBadge,
  type Status,
} from "@/components/admin/status-badge";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAdministrator } from "@/lib/auth/require-admin";

import { AddKnowledgeSource } from "./knowledge-sources-client";
import { ProcessingStatusRefresh } from "./processing-status-refresh";

type SourceStatus = Extract<
  Status,
  "processing" | "available" | "failed" | "disabled"
>;

type KnowledgeSource = {
  id: string;
  title: string;
  source_type: string;
  original_url: string | null;
  status: SourceStatus;
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
    ({ status }) => status === "processing",
  );

  return (
    <main className="page-enter min-h-screen">
      {hasProcessingSources ? <ProcessingStatusRefresh /> : null}

      <AdminPageHeader
        actions={<AddKnowledgeSource />}
        description="管理助手回答所依赖的业务知识与处理状态"
        title="知识来源"
      />

      <div className="mx-auto max-w-300 p-5 sm:p-8">
        <section className="overflow-hidden rounded-xl border border-(--line) bg-white">
          {sources.length === 0 ? (
            <EmptyKnowledgeSources />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-220 border-collapse text-left">
                <thead className="border-b border-(--line) bg-(--paper)">
                  <tr className="mono text-[11px] font-semibold text-(--ink-600)">
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
    <Empty className="min-h-72">
      <EmptyMedia>
        <FileText className="size-5" aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>还没有知识来源</EmptyTitle>
      <EmptyDescription>
        导入公开网页或添加手工内容，处理完成后即可用于有据回答。
      </EmptyDescription>
    </Empty>
  );
}

function KnowledgeSourceRow({ source }: { source: KnowledgeSource }) {
  const SourceIcon = source.source_type === "url" ? Globe : FileText;

  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <SourceIcon
            className="size-5 shrink-0 text-(--forest-800)"
            strokeWidth={1.7}
          />
          <div>
            <p className="font-medium text-(--ink-900)">{source.title}</p>
            <p className="mono mt-0.5 text-[10px] text-(--ink-600)">
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
        <StatusBadge status={source.status} />
        {source.failure_reason ? (
          <p className="mt-1 max-w-68 text-[11px] leading-4 text-(--danger)">
            {source.failure_reason}
          </p>
        ) : null}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-600)">
        {source.current_revision_id ? "v1" : "—"}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-600)">
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
