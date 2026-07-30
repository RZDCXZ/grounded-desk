import {
  MessageSquareText,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { requireAdministrator } from "@/lib/auth/require-admin";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ConversationDetail } from "./conversation-detail";
import {
  ConversationResultBadge,
  type ConversationReviewResultType,
} from "./conversation-result-badge";

type ResultFilter = "all" | ConversationReviewResultType;
type ConversationSummary = {
  id: string;
  created_at: string;
  last_activity_at: string;
  question_summary: string;
  result_type: ConversationReviewResultType | null;
  feedback_value: "helpful" | "unhelpful" | null;
  question_count: number;
};

const resultFilters: Array<{
  label: string;
  value: ResultFilter;
}> = [
  { label: "全部", value: "all" },
  { label: "有据回答", value: "grounded_answer" },
  { label: "知识冲突", value: "knowledge_conflict" },
  { label: "交流性回应", value: "conversational_response" },
  { label: "澄清提问", value: "clarification_request" },
  { label: "人工接续", value: "human_handoff" },
  { label: "可靠拒答", value: "grounded_refusal" },
  { label: "技术故障", value: "technical_failure" },
];

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const query = await searchParams;
  const { supabase } = await requireAdministrator();
  const { data, error } = await supabase.rpc("list_recent_conversations");

  if (error) {
    throw new Error("暂时无法读取最近会话", { cause: error });
  }

  const conversations = (data ?? []) as ConversationSummary[];
  const searchQuery = query.q?.trim() ?? "";
  const normalizedSearchQuery = searchQuery.toLocaleLowerCase();
  const resultFilter = isResultFilter(query.status) ? query.status : "all";
  const filteredConversations = conversations.filter((conversation) => {
    const matchesSearch =
      !normalizedSearchQuery ||
      conversation.question_summary
        .toLocaleLowerCase()
        .includes(normalizedSearchQuery);
    const matchesResult =
      resultFilter === "all" || conversation.result_type === resultFilter;

    return matchesSearch && matchesResult;
  });
  const selectedConversation =
    filteredConversations.find(({ id }) => id === query.conversation) ??
    filteredConversations[0];

  return (
    <main className="page-enter min-h-screen">
      <AdminPageHeader
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/assistant#assistant-preview-question">
              预览助手
            </Link>
          </Button>
        }
        description="复盘匿名访客最近 30 天内的交流记录、回答依据与质量结果"
        title="会话"
      />

      <div className="border-line lg:grid lg:h-[calc(100vh-80px)] lg:grid-cols-[38%_62%] lg:border-b">
        <aside
          aria-label="会话列表"
          className="min-w-0 border-b border-line bg-card lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-b-0"
        >
          <div className="space-y-3 border-b border-line p-4">
            <form className="flex gap-2" method="get">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
                />
                <Input
                  aria-label="搜索提问摘要"
                  className="pl-9"
                  defaultValue={searchQuery}
                  name="q"
                  placeholder="搜索提问摘要…"
                />
              </div>
              {resultFilter !== "all" ? (
                <input name="status" type="hidden" value={resultFilter} />
              ) : null}
              <Button size="compact" type="submit" variant="secondary">
                搜索
              </Button>
            </form>
            <nav
              aria-label="会话结果筛选"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {resultFilters.map((filter) => (
                <ResultFilterLink
                  active={resultFilter === filter.value}
                  count={countForFilter(conversations, filter.value)}
                  filter={filter}
                  key={filter.value}
                  searchQuery={searchQuery}
                />
              ))}
            </nav>
          </div>

          {filteredConversations.length > 0 ? (
            <ol className="divide-y divide-line lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {filteredConversations.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationItem
                    active={selectedConversation?.id === conversation.id}
                    conversation={conversation}
                    resultFilter={resultFilter}
                    searchQuery={searchQuery}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <Empty className="min-h-64 lg:flex-1">
              <EmptyMedia>
                <MessageSquareText aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {conversations.length > 0
                  ? "没有匹配的会话"
                  : "最近还没有访客会话"}
              </EmptyTitle>
              <EmptyDescription>
                {conversations.length > 0
                  ? "调整搜索词或结果筛选后再试。"
                  : "访客开始咨询后，会在这里显示首问摘要、回答结果和质量反馈。"}
              </EmptyDescription>
            </Empty>
          )}
        </aside>

        <div className="min-w-0 bg-paper lg:flex lg:min-h-0">
          {selectedConversation ? (
            <ConversationDetail
              conversationId={selectedConversation.id}
              variant="panel"
            />
          ) : (
            <Empty className="min-h-96">
              <EmptyMedia>
                <MessageSquareText aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>选择一个会话开始复盘</EmptyTitle>
              <EmptyDescription>
                会话详情会展示消息、引用快照、质量反馈和系统状态。
              </EmptyDescription>
            </Empty>
          )}
        </div>
      </div>
    </main>
  );
}

function ResultFilterLink({
  active,
  count,
  filter,
  searchQuery,
}: {
  active: boolean;
  count: number;
  filter: (typeof resultFilters)[number];
  searchQuery: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "mono inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-[10px] font-semibold transition-colors",
        active
          ? "border-forest-950 bg-forest-950 text-white"
          : "border-line bg-card text-ink-600 hover:bg-paper",
      )}
      href={buildConversationHref({
        q: searchQuery,
        status: filter.value,
      })}
    >
      {filter.label} {count}
    </Link>
  );
}

function ConversationItem({
  active,
  conversation,
  resultFilter,
  searchQuery,
}: {
  active: boolean;
  conversation: ConversationSummary;
  resultFilter: ResultFilter;
  searchQuery: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "block border-l-2 px-4 py-4 transition-colors",
        active
          ? "border-forest-800 bg-forest-100/40"
          : "border-transparent hover:bg-paper",
      )}
      href={buildConversationHref({
        conversation: conversation.id,
        q: searchQuery,
        status: resultFilter,
      })}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 text-[13px] leading-5 font-[650] text-ink-900">
          {conversation.question_summary}
        </p>
        <time className="mono shrink-0 text-[10px] text-ink-400">
          {formatDateTime(conversation.last_activity_at)}
        </time>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ConversationResultBadge resultType={conversation.result_type} />
        <FeedbackLabel
          feedback={conversation.feedback_value}
          resultType={conversation.result_type}
        />
        <span className="ml-auto text-[10px] text-ink-400">
          {conversation.question_count} 个问题
        </span>
      </div>
    </Link>
  );
}

function FeedbackLabel({
  feedback,
  resultType,
}: {
  feedback: ConversationSummary["feedback_value"];
  resultType: ConversationSummary["result_type"];
}) {
  if (
    resultType !== "grounded_answer" &&
    resultType !== "grounded_refusal"
  ) {
    return null;
  }

  if (!feedback) {
    return (
      <span className="text-[10px] text-ink-400">尚无质量反馈</span>
    );
  }

  const helpful = feedback === "helpful";
  const Icon = helpful ? ThumbsUp : ThumbsDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium",
        helpful ? "text-success" : "text-warning",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {helpful ? "有帮助" : "没帮助"}
    </span>
  );
}

function buildConversationHref({
  conversation,
  q,
  status,
}: {
  conversation?: string;
  q?: string;
  status?: ResultFilter;
}) {
  const params = new URLSearchParams();

  if (conversation) {
    params.set("conversation", conversation);
  }

  if (q) {
    params.set("q", q);
  }

  if (status && status !== "all") {
    params.set("status", status);
  }

  const query = params.toString();
  return query ? `/admin/conversations?${query}` : "/admin/conversations";
}

function countForFilter(
  conversations: ConversationSummary[],
  filter: ResultFilter,
) {
  return filter === "all"
    ? conversations.length
    : conversations.filter(({ result_type }) => result_type === filter).length;
}

function isResultFilter(value: string | undefined): value is ResultFilter {
  return resultFilters.some((filter) => filter.value === value);
}
