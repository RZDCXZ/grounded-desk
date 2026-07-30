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
import { KnowledgeSourceActions } from "./knowledge-source-actions";
import { ProcessingStatusRefresh } from "./processing-status-refresh";

type SourceStatus = Extract<
  Status,
  "processing" | "available" | "failed" | "disabled"
>;

type KnowledgeSource = {
  id: string;
  title: string;
  source_type: "manual" | "url";
  original_url: string | null;
  status: SourceStatus;
  failure_reason: string | null;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProcessingStage =
  | "fetching"
  | "extracting"
  | "forming_content_units"
  | "vectorizing";

type KnowledgeRevision = {
  id: string;
  knowledge_source_id: string;
  title: string;
  body: string;
  original_url: string | null;
  status: "processing" | "available" | "failed" | "superseded";
  processing_stage: ProcessingStage | null;
  created_at: string;
};

export default async function KnowledgeSourcesPage() {
  const { supabase, organization } = await requireAdministrator();
  const [sourcesResult, revisionsResult] = await Promise.all([
    supabase
      .from("knowledge_sources")
      .select(
        "id, title, source_type, original_url, status, failure_reason, current_revision_id, created_at, updated_at",
      )
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("knowledge_revisions")
      .select(
        "id, knowledge_source_id, title, body, original_url, status, processing_stage, created_at",
      )
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
  ]);
  const sources = (sourcesResult.data ?? []) as KnowledgeSource[];
  const revisions = (revisionsResult.data ?? []) as KnowledgeRevision[];
  const revisionsBySource = groupRevisionsBySource(revisions);
  const hasProcessingSources =
    revisions.some(({ status }) => status === "processing") ||
    sources.some(({ status }) => status === "processing");

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
                    <th className="px-6 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--line) text-[13px]">
                  {sources.map((source) => (
                    <KnowledgeSourceRow
                      key={source.id}
                      revisions={revisionsBySource.get(source.id) ?? []}
                      source={source}
                    />
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

function KnowledgeSourceRow({
  revisions,
  source,
}: {
  revisions: KnowledgeRevision[];
  source: KnowledgeSource;
}) {
  const SourceIcon = source.source_type === "url" ? Globe : FileText;
  const processingRevision = revisions.find(
    ({ status }) => status === "processing",
  );
  const currentRevision = revisions.find(
    ({ id }) => id === source.current_revision_id,
  );
  const latestRevision = revisions.at(-1);
  const successfulRevisions = revisions.filter(
    ({ status }) => status === "available" || status === "superseded",
  );
  const editableRevision =
    latestRevision?.status === "failed"
      ? latestRevision
      : currentRevision ?? latestRevision;
  const processing = Boolean(processingRevision);
  const currentVersion = currentRevision
    ? successfulRevisions.findIndex(({ id }) => id === currentRevision.id) + 1
    : null;
  const processingVersion = processingRevision
    ? successfulRevisions.length + 1
    : null;
  let displayStatus: SourceStatus = source.status;

  if (latestRevision?.status === "failed") {
    displayStatus = "failed";
  }

  if (source.status === "disabled") {
    displayStatus = "disabled";
  }

  if (processing) {
    displayStatus = "processing";
  }

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
        <StatusBadge status={displayStatus} />
        {processingRevision ? (
          <div className="mt-1 max-w-68 text-[11px] leading-4 text-(--ink-600)">
            <p>
              新知识版本 v{processingVersion} ·{" "}
              {formatProcessingStage(processingRevision.processing_stage)}
            </p>
            {currentVersion ? <p>当前 v{currentVersion} 继续可用</p> : null}
          </div>
        ) : source.failure_reason ? (
          <div className="mt-1 max-w-68 text-[11px] leading-4">
            <p className="text-(--danger)">{source.failure_reason}</p>
            {currentVersion ? (
              <p className="text-(--ink-600)">
                失败草稿已保留；当前 v{currentVersion} 继续可用
              </p>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-600)">
        {currentVersion ? `v${currentVersion}` : "—"}
      </td>
      <td className="mono px-6 py-4 text-xs text-(--ink-600)">
        {formatUpdatedAt(source.updated_at)}
      </td>
      <td className="px-6 py-1.5 text-right">
        <KnowledgeSourceActions
          manualRevision={
            source.source_type === "manual" && editableRevision
              ? {
                  title: editableRevision.title,
                  body: editableRevision.body,
                  originalUrl: editableRevision.original_url,
                }
              : null
          }
          processing={processing}
          retryable={Boolean(source.failure_reason)}
          sourceId={source.id}
          sourceTitle={source.title}
          sourceType={source.source_type}
          status={source.status}
        />
      </td>
    </tr>
  );
}

function groupRevisionsBySource(revisions: KnowledgeRevision[]) {
  const grouped = new Map<string, KnowledgeRevision[]>();

  for (const revision of revisions) {
    const sourceRevisions = grouped.get(revision.knowledge_source_id) ?? [];
    sourceRevisions.push(revision);
    grouped.set(revision.knowledge_source_id, sourceRevisions);
  }

  return grouped;
}

function formatProcessingStage(stage: ProcessingStage | null) {
  const labels: Record<ProcessingStage, string> = {
    fetching: "正在抓取",
    extracting: "正在提取",
    forming_content_units: "正在形成内容单元",
    vectorizing: "正在向量化",
  };

  return stage ? labels[stage] : "正在处理";
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
