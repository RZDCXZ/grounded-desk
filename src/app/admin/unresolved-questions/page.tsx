import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  MessageSquareText,
  ThumbsDown,
} from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAdministrator } from "@/lib/auth/require-admin";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { markUnresolvedQuestionResolved } from "./actions";

type QueueStatus = "pending" | "resolved";
type UnresolvedQuestion = {
  id: string;
  conversation_id: string | null;
  answer_message_id: string | null;
  question: string;
  answer_content: string | null;
  citations: unknown;
  trigger_type: "grounded_refusal" | "negative_feedback";
  status: QueueStatus;
  created_at: string;
  resolved_at: string | null;
};
type CitationSnapshot = {
  knowledgeSourceId: string | null;
  title: string;
  url: string | null;
};

export const dynamic = "force-dynamic";

export default async function UnresolvedQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ question?: string; status?: string }>;
}) {
  const query = await searchParams;
  const status: QueueStatus =
    query.status === "resolved" ? "resolved" : "pending";
  const { organization, supabase } = await requireAdministrator();
  const [questionsResult, pendingCountResult, resolvedCountResult] =
    await Promise.all([
      supabase
        .from("unresolved_questions")
        .select(
          "id, conversation_id, answer_message_id, question, answer_content, citations, trigger_type, status, created_at, resolved_at",
        )
        .eq("organization_id", organization.id)
        .eq("status", status)
        .order("created_at", { ascending: false }),
      supabase
        .from("unresolved_questions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "pending"),
      supabase
        .from("unresolved_questions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "resolved"),
    ]);

  if (questionsResult.error) {
    throw new Error("暂时无法读取待解决问题队列", {
      cause: questionsResult.error,
    });
  }

  const questions = (questionsResult.data ?? []) as UnresolvedQuestion[];
  const selected =
    questions.find(({ id }) => id === query.question) ?? questions[0];

  return (
    <main className="page-enter min-h-screen">
      <AdminPageHeader
        description="仅收录可靠拒答或负面质量反馈；技术故障由系统日志另行监控"
        title="待解决问题"
      />

      <div className="mx-auto max-w-300 p-5 sm:p-8">
        <div className="overflow-hidden rounded-xl border border-line bg-card lg:grid lg:min-h-170 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-line lg:border-r lg:border-b-0">
            <nav
              aria-label="待解决问题状态"
              className="grid grid-cols-2 gap-1 border-b border-line bg-paper p-1"
            >
              <QueueTab
                active={status === "pending"}
                count={pendingCountResult.count ?? 0}
                href="/admin/unresolved-questions?status=pending"
                label="待处理"
              />
              <QueueTab
                active={status === "resolved"}
                count={resolvedCountResult.count ?? 0}
                href="/admin/unresolved-questions?status=resolved"
                label="已解决"
              />
            </nav>

            {questions.length > 0 ? (
              <div className="divide-y divide-line">
                {questions.map((question) => (
                  <QueueItem
                    active={selected?.id === question.id}
                    key={question.id}
                    question={question}
                    status={status}
                  />
                ))}
              </div>
            ) : (
              <Empty className="min-h-64">
                <EmptyMedia>
                  <CheckCircle2 aria-hidden="true" className="size-5" />
                </EmptyMedia>
                <EmptyTitle>
                  {status === "pending"
                    ? "没有待处理问题"
                    : "还没有已解决问题"}
                </EmptyTitle>
                <EmptyDescription>
                  {status === "pending"
                    ? "可靠拒答或“没帮助”反馈出现后，会自动进入这里。"
                    : "标记为已解决的问题会保留在此供复盘。"}
                </EmptyDescription>
              </Empty>
            )}
          </aside>

          <section className="min-w-0">
            {selected ? (
              <QuestionDetail question={selected} />
            ) : (
              <Empty className="min-h-96">
                <EmptyMedia>
                  <MessageSquareText aria-hidden="true" className="size-5" />
                </EmptyMedia>
                <EmptyTitle>改进队列已清空</EmptyTitle>
                <EmptyDescription>
                  当前状态下没有需要复盘的访客问题。
                </EmptyDescription>
              </Empty>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function QueueTab({
  active,
  count,
  href,
  label,
}: {
  active: boolean;
  count: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-2 text-center text-[13px] font-medium transition-colors",
        active
          ? "bg-card text-forest-950"
          : "text-ink-600 hover:bg-card/60 hover:text-ink-900",
      )}
      href={href}
    >
      {label} ({count})
    </Link>
  );
}

function QueueItem({
  active,
  question,
  status,
}: {
  active: boolean;
  question: UnresolvedQuestion;
  status: QueueStatus;
}) {
  return (
    <Link
      className={cn(
        "block border-l-2 px-5 py-4 transition-colors",
        active
          ? "border-forest-800 bg-forest-100/40"
          : "border-transparent hover:bg-paper",
      )}
      href={`/admin/unresolved-questions?status=${status}&question=${question.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <TriggerLabel trigger={question.trigger_type} />
        <span className="mono text-[10px] text-ink-400">
          {formatDate(question.resolved_at ?? question.created_at)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] leading-5 font-medium">
        {question.question}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusBadge status={question.status} />
        <ArrowRight aria-hidden="true" className="size-3.5 text-ink-400" />
      </div>
    </Link>
  );
}

function QuestionDetail({ question }: { question: UnresolvedQuestion }) {
  const citations = readCitationSnapshots(question.citations);

  return (
    <div className="mx-auto max-w-180 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <TriggerLabel trigger={question.trigger_type} />
          <StatusBadge status={question.status} />
        </div>
        {question.conversation_id ? (
          <Button asChild variant="secondary">
            <Link
              href={`/admin/conversations/${question.conversation_id}?unresolvedQuestion=${question.id}`}
            >
              <ExternalLink aria-hidden="true" />
              查看会话上下文
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-6 space-y-6">
        <DetailSection label="原始提问">
          <p className="rounded-xl border border-line bg-paper p-4 text-[15px] leading-7">
            {question.question}
          </p>
        </DetailSection>

        <DetailSection label="助手回答">
          <div className="rounded-xl border border-line bg-card p-4 text-sm leading-6">
            {question.answer_content ?? "早期记录未保存助手回答快照。"}
          </div>
        </DetailSection>

        <DetailSection label="引用快照">
          {citations.length > 0 ? (
            <div className="space-y-2">
              {citations.map((citation, index) => (
                <CitationSnapshotCard
                  citation={citation}
                  key={`${citation.knowledgeSourceId ?? "snapshot"}-${index}`}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-paper p-4 text-[13px] text-ink-600">
              这条回答没有引用。
            </p>
          )}
        </DetailSection>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-warning/20 bg-warning-light p-4">
            <p className="text-[11px] font-semibold text-warning">触发原因</p>
            <p className="mt-2 text-[13px] leading-5">
              {question.trigger_type === "grounded_refusal"
                ? "可靠拒答：现有知识不足以支持事实性回答。"
                : "没帮助：访客明确认为这条助手回答没有帮助。"}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="text-[11px] font-semibold text-ink-600">
              创建时间
            </p>
            <p className="mono mt-2 text-xs text-ink-600">
              {formatDateTime(question.created_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <Button asChild>
          <Link href="/admin/knowledge-sources">
            <FileText aria-hidden="true" />
            更新知识来源
          </Link>
        </Button>
        {question.status === "pending" ? (
          <form action={markUnresolvedQuestionResolved}>
            <input
              name="unresolvedQuestionId"
              type="hidden"
              value={question.id}
            />
            <Button type="submit" variant="secondary">
              <CheckCircle2 aria-hidden="true" />
              标记为已解决
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-2 text-[13px] font-medium text-success">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            已于 {formatDateTime(question.resolved_at ?? question.created_at)} 解决
          </p>
        )}
      </div>
    </div>
  );
}

function DetailSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold text-ink-600">{label}</h2>
      {children}
    </section>
  );
}

function TriggerLabel({
  trigger,
}: {
  trigger: UnresolvedQuestion["trigger_type"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        trigger === "grounded_refusal"
          ? "bg-warning-light text-warning"
          : "bg-danger-light text-danger",
      )}
    >
      {trigger === "negative_feedback" ? (
        <ThumbsDown aria-hidden="true" className="size-3" />
      ) : (
        <MessageSquareText aria-hidden="true" className="size-3" />
      )}
      {trigger === "grounded_refusal" ? "可靠拒答" : "没帮助"}
    </span>
  );
}

function CitationSnapshotCard({
  citation,
}: {
  citation: CitationSnapshot;
}) {
  const content = (
    <>
      <FileText aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          {citation.title}
        </span>
        <span className="mono mt-0.5 block truncate text-[10px] text-ink-600">
          {citation.url ?? "回答时未保存地址"}
        </span>
      </span>
      {citation.url ? (
        <ExternalLink aria-hidden="true" className="size-3.5 text-ink-400" />
      ) : null}
    </>
  );
  const className =
    "flex min-h-14 items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2";

  return citation.url ? (
    <a
      className={className}
      href={citation.url}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function readCitationSnapshots(value: unknown): CitationSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (citation): citation is CitationSnapshot =>
      typeof citation === "object" &&
      citation !== null &&
      "title" in citation &&
      typeof citation.title === "string" &&
      "url" in citation &&
      (citation.url === null || typeof citation.url === "string") &&
      "knowledgeSourceId" in citation &&
      (citation.knowledgeSourceId === null ||
        typeof citation.knowledgeSourceId === "string"),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
