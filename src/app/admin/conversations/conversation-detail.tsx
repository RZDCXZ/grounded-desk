import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  ExternalLink,
  FileText,
  GitCompare,
  ServerCrash,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ControlledMarkdown } from "@/components/assistant/controlled-markdown";
import { Button } from "@/components/ui/button";
import { requireAdministrator } from "@/lib/auth/require-admin";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import {
  ConversationResultBadge,
  type ConversationReviewResultType,
} from "./conversation-result-badge";
import { DeleteConversationAction } from "./delete-conversation-action";

type MessageType =
  | "visitor_question"
  | "answer_retry"
  | ConversationReviewResultType;
type Message = {
  id: string;
  message_type: MessageType;
  content: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
};
type Citation = {
  id: string;
  message_id: string;
  factual_request_id: string | null;
  knowledge_source_id: string | null;
  source_title: string;
  source_url: string | null;
};
type Feedback = {
  answer_message_id: string;
  feedback_value: "helpful" | "unhelpful";
  updated_at: string;
};
type LinkedQuestion = {
  id: string;
  answer_message_id: string | null;
  factual_request_id: string | null;
  trigger_type:
    | "grounded_refusal"
    | "negative_feedback"
    | "unsupported_factual_request"
    | "knowledge_conflict";
  status: "pending" | "resolved";
};
type FactualRequestReview = {
  id: string;
  assistant_message_id: string;
  request_order: number;
  original_text: string;
  normalized_question: string;
  completeness: "complete" | "incomplete";
  coverage_status: "supported" | "unsupported" | "conflicting" | null;
  missing_information: string[];
  clarification_round: 0 | 1 | 2;
  request_analysis_version: string;
  response_strategy_version: string;
  response_content: string | null;
  response_status:
    | "supported"
    | "unsupported"
    | "conflicting"
    | "clarification"
    | "handoff"
    | null;
};
type EvidenceSnapshotReview = {
  id: string;
  factual_request_id: string;
  content_unit_id: string;
  source_title: string;
  source_url: string | null;
  exact_excerpt: string;
  decision_reason: string;
  coverage_decision_version: string;
};

export async function ConversationDetail({
  conversationId,
  highlightedQuestionId,
  variant,
}: {
  conversationId: string;
  highlightedQuestionId?: string;
  variant: "page" | "panel";
}) {
  const { organization, supabase } = await requireAdministrator();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, created_at, last_activity_at")
    .eq("id", conversationId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error || !conversation) {
    notFound();
  }

  const [
    messagesResult,
    citationsResult,
    feedbackResult,
    questionsResult,
    factualRequestsResult,
    evidenceSnapshotsResult,
  ] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id, message_type, content, status, created_at")
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("citations")
        .select(
          "id, message_id, factual_request_id, knowledge_source_id, source_title, source_url",
        )
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("quality_feedback")
        .select("answer_message_id, feedback_value, updated_at")
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId),
      supabase
        .from("unresolved_questions")
        .select("id, answer_message_id, factual_request_id, trigger_type, status")
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId),
      supabase
        .from("message_factual_requests")
        .select(
          "id, assistant_message_id, request_order, original_text, normalized_question, completeness, coverage_status, missing_information, clarification_round, request_analysis_version, response_strategy_version, response_content, response_status",
        )
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId)
        .order("request_order", { ascending: true }),
      supabase
        .from("evidence_snapshots")
        .select(
          "id, factual_request_id, content_unit_id, source_title, source_url, exact_excerpt, decision_reason, coverage_decision_version",
        )
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId)
        .eq("relationship", "conflicts")
        .order("created_at", { ascending: true }),
    ]);
  const readError =
    messagesResult.error ??
    citationsResult.error ??
    feedbackResult.error ??
    questionsResult.error ??
    factualRequestsResult.error ??
    evidenceSnapshotsResult.error;

  if (readError) {
    throw new Error("暂时无法读取会话上下文", { cause: readError });
  }

  const messages = (messagesResult.data ?? []) as Message[];
  const citations = (citationsResult.data ?? []) as Citation[];
  const feedback = (feedbackResult.data ?? []) as Feedback[];
  const linkedQuestions = (questionsResult.data ?? []) as LinkedQuestion[];
  const factualRequests =
    (factualRequestsResult.data ?? []) as FactualRequestReview[];
  const evidenceSnapshots =
    (evidenceSnapshotsResult.data ?? []) as EvidenceSnapshotReview[];
  const selectedQuestion = linkedQuestions.find(
    ({ id }) => id === highlightedQuestionId,
  );
  const transcript = (
    <ConversationTranscript
      citations={citations}
      feedback={feedback}
      evidenceSnapshots={evidenceSnapshots}
      factualRequests={factualRequests}
      linkedQuestions={linkedQuestions}
      messages={messages}
      selectedQuestion={selectedQuestion}
    />
  );

  if (variant === "panel") {
    return (
      <section className="flex min-h-0 flex-1 flex-col bg-paper">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div>
            <p className="text-sm font-[650] text-forest-950">
              匿名访客 #{conversation.id.slice(-4)}
            </p>
            <p className="mt-1 text-[11px] text-ink-600">
              创建于 {formatDateTime(conversation.created_at)} ·{" "}
              {countQuestions(messages)} 个问题
            </p>
          </div>
          <DeleteConversationAction conversationId={conversationId} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {transcript}
        </div>
      </section>
    );
  }

  return (
    <main className="page-enter min-h-screen">
      <AdminPageHeader
        actions={
          <>
            <Button asChild variant="secondary">
              <Link
                href={
                  selectedQuestion
                    ? `/admin/unresolved-questions?status=${selectedQuestion.status}&question=${selectedQuestion.id}`
                    : "/admin/conversations"
                }
              >
                <ArrowLeft aria-hidden="true" />
                {selectedQuestion ? "返回问题详情" : "返回会话"}
              </Link>
            </Button>
            <DeleteConversationAction conversationId={conversationId} />
          </>
        }
        description={`创建于 ${formatDateTime(conversation.created_at)} · ${countQuestions(messages)} 个问题`}
        title="会话上下文"
      />

      {selectedQuestion ? (
        <div className="border-b border-warning/20 bg-warning-light px-5 py-3 sm:px-8">
          <div className="mx-auto flex max-w-220 flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
              <AlertTriangle aria-hidden="true" className="size-4" />
              正在复盘关联待解决问题
            </p>
            <Link
              className="text-xs font-semibold text-forest-800 hover:underline"
              href={`/admin/unresolved-questions?status=${selectedQuestion.status}&question=${selectedQuestion.id}`}
            >
              返回待解决问题
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-220 p-5 sm:p-8">{transcript}</div>
    </main>
  );
}

function ConversationTranscript({
  citations,
  feedback,
  evidenceSnapshots,
  factualRequests,
  linkedQuestions,
  messages,
  selectedQuestion,
}: {
  citations: Citation[];
  feedback: Feedback[];
  evidenceSnapshots: EvidenceSnapshotReview[];
  factualRequests: FactualRequestReview[];
  linkedQuestions: LinkedQuestion[];
  messages: Message[];
  selectedQuestion?: LinkedQuestion;
}) {
  return (
    <div className="space-y-7">
      {messages
        .filter(({ message_type }) => message_type !== "answer_retry")
        .map((message) =>
          message.message_type === "visitor_question" ? (
            <VisitorMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage
              citations={citations.filter(
                ({ message_id }) => message_id === message.id,
              )}
              feedback={feedback.find(
                ({ answer_message_id }) => answer_message_id === message.id,
              )}
              evidenceSnapshots={evidenceSnapshots.filter(({ factual_request_id }) =>
                factualRequests.some(
                  ({ assistant_message_id, id }) =>
                    assistant_message_id === message.id &&
                    id === factual_request_id,
                )
              )}
              factualRequests={factualRequests.filter(
                ({ assistant_message_id }) =>
                  assistant_message_id === message.id,
              )}
              highlighted={
                selectedQuestion?.answer_message_id === message.id
              }
              key={message.id}
              linkedQuestions={linkedQuestions.filter(
                ({ answer_message_id }) => answer_message_id === message.id,
              )}
              message={message}
            />
          ),
        )}
    </div>
  );
}

function VisitorMessage({ message }: { message: Message }) {
  return (
    <article className="flex flex-col items-end gap-2">
      <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-forest-800 px-4 py-3 text-sm leading-6 text-white">
        {message.content}
      </div>
      <time className="mono text-[10px] text-ink-400">
        {formatTime(message.created_at)}
      </time>
    </article>
  );
}

function AssistantMessage({
  citations,
  evidenceSnapshots,
  factualRequests,
  feedback,
  highlighted,
  linkedQuestions,
  message,
}: {
  citations: Citation[];
  evidenceSnapshots: EvidenceSnapshotReview[];
  factualRequests: FactualRequestReview[];
  feedback?: Feedback;
  highlighted: boolean;
  linkedQuestions: LinkedQuestion[];
  message: Message;
}) {
  const isPending = message.status === "pending";
  const isRefusal = message.message_type === "grounded_refusal";
  const isConflict = message.message_type === "knowledge_conflict";
  const isHandoff = message.message_type === "human_handoff";
  const isFailure = message.message_type === "technical_failure";
  const isGroundedAnswer = message.message_type === "grounded_answer";
  const isPartial = message.message_type === "partially_grounded_answer";
  const factualRequest = factualRequests[0];
  const linkedQuestion = linkedQuestions[0];
  const resultType = getAssistantResultType(message);
  const canHaveReviewMetadata =
    isGroundedAnswer || isPartial || isRefusal;
  const isMultiRequest = factualRequests.length > 1;

  return (
    <article className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-forest-950">
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-full bg-forest-100"
        >
          <span className="size-2 border border-forest-800" />
        </span>
        助手
        <ConversationResultBadge
          resultType={isPending ? null : resultType}
        />
      </div>
      <div
        className={cn(
          "max-w-[94%] rounded-xl rounded-tl-sm border p-4",
          isPending
            ? "border-info/30 bg-info-light"
            : isFailure
              ? "border-danger/30 bg-danger-light"
              : isHandoff
                ? "border-info/30 bg-info-light"
              : isRefusal
                ? "border-warning/30 bg-warning-light"
              : isConflict
                ? "border-warning/30 bg-warning-light"
                : isGroundedAnswer
                  ? "border-line border-l-4 border-l-success bg-card"
                  : "border-line bg-card",
          highlighted &&
            "ring-2 ring-warning ring-offset-4 ring-offset-paper",
        )}
      >
        {isPending ? (
          <ResultHeading icon={Clock3} label="等待回答" tone="info" />
        ) : isFailure ? (
          <ResultHeading
            icon={ServerCrash}
            label="技术故障"
            tone="danger"
          />
        ) : isHandoff ? (
          <ResultHeading
            icon={UserCheck}
            label="需要人工协助确认"
            tone="info"
          />
        ) : isRefusal ? (
          <ResultHeading
            icon={AlertTriangle}
            label="可靠拒答"
            tone="warning"
          />
        ) : isConflict ? (
          <ResultHeading
            icon={GitCompare}
            label="现有知识存在冲突"
            tone="warning"
          />
        ) : null}

        {isMultiRequest ? (
          <MultiRequestReviewSections
            citations={citations}
            evidenceSnapshots={evidenceSnapshots}
            factualRequests={factualRequests}
            linkedQuestions={linkedQuestions}
          />
        ) : (
          <div
            className={cn(
              "text-sm leading-6",
              (isPending ||
                isFailure ||
                isRefusal ||
                isConflict ||
                isHandoff) &&
                "mt-3",
            )}
          >
            {isPending ? (
              <p>回答仍在生成中。</p>
            ) : (
              <ControlledMarkdown>{message.content}</ControlledMarkdown>
            )}
          </div>
        )}

        {!isMultiRequest &&
        factualRequest?.completeness === "incomplete" ? (
          <div className="mt-4 border-t border-info/20 pt-3 text-[11px] leading-5 text-ink-600">
            <p className="font-semibold text-info">
              {isHandoff
                ? "两轮澄清后转人工接续"
                : `第 ${factualRequest.clarification_round} 轮澄清`}
            </p>
            <p className="mt-1">
              仍缺少：
              {factualRequest.missing_information.join("、")}
            </p>
          </div>
        ) : null}

        {!isMultiRequest && isGroundedAnswer && citations.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-semibold text-ink-600">
              回答依据
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {citations.map((citation) => (
                <CitationCard citation={citation} key={citation.id} />
              ))}
            </div>
          </div>
        ) : null}

        {!isMultiRequest && isConflict && evidenceSnapshots.length > 0 ? (
          <div className="mt-4 border-t border-warning/20 pt-3">
            <p className="mb-2 text-[11px] font-semibold text-warning">
              冲突来源
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {evidenceSnapshots.map((snapshot) => (
                <ConflictSnapshotCard
                  key={snapshot.id}
                  snapshot={snapshot}
                />
              ))}
            </div>
            {factualRequest ? (
              <details className="mt-3 rounded-lg border border-line bg-paper">
                <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-ink-600">
                  查看冲突判定审计
                </summary>
                <div className="border-t border-line px-3 py-3 text-[10px] leading-5 text-ink-600">
                  <div className="mono">
                    <p>
                      规范化诉求：{factualRequest.normalized_question}
                    </p>
                    <p>
                      覆盖状态：{factualRequest.coverage_status} ·
                      请求分析：{factualRequest.request_analysis_version}
                    </p>
                    <p>
                      响应策略：{factualRequest.response_strategy_version}
                    </p>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {evidenceSnapshots.map((snapshot) => (
                      <li key={snapshot.id}>
                        <p className="font-semibold text-ink-900">
                          {snapshot.source_title}
                        </p>
                        <p>
                          审计说明：{snapshot.decision_reason}
                        </p>
                        <p className="mono text-ink-400">
                          覆盖判定版本{" "}
                          {snapshot.coverage_decision_version}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {canHaveReviewMetadata && feedback ? (
          <div
            className={cn(
              "mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12px] font-medium",
              feedback.feedback_value === "helpful"
                ? "text-success"
                : "text-warning",
            )}
          >
            {feedback.feedback_value === "helpful" ? (
              <ThumbsUp aria-hidden="true" className="size-4" />
            ) : (
              <ThumbsDown aria-hidden="true" className="size-4" />
            )}
            访客评价：
            {feedback.feedback_value === "helpful"
              ? "有帮助"
              : "没帮助"}
          </div>
        ) : null}

        {!isMultiRequest &&
        (canHaveReviewMetadata || isConflict) &&
        linkedQuestion ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning-light/60 p-3">
            <span className="text-[11px] text-warning">
              已关联{linkedQuestion.status === "pending" ? "待处理" : "已解决"}
              的待解决问题
            </span>
            <Link
              className="text-[11px] font-semibold text-forest-800 hover:underline"
              href={`/admin/unresolved-questions?status=${linkedQuestion.status}&question=${linkedQuestion.id}`}
            >
              查看问题
            </Link>
          </div>
        ) : null}

        {isFailure ? (
          <p className="mt-3 text-[11px] font-semibold text-danger">
            未创建待解决问题
          </p>
        ) : null}
      </div>
      <time className="mono text-[10px] text-ink-400">
        {formatTime(message.created_at)}
      </time>
    </article>
  );
}

function ConflictSnapshotCard({
  snapshot,
}: {
  snapshot: EvidenceSnapshotReview;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <FileText
          aria-hidden="true"
          className="size-4 shrink-0 text-warning"
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
          {snapshot.source_title}
        </span>
        {snapshot.source_url ? (
          <ExternalLink
            aria-hidden="true"
            className="size-3.5 text-ink-400"
          />
        ) : null}
      </div>
      <p className="mono mt-1 break-all text-[9px] text-ink-400">
        知识快照 {snapshot.content_unit_id}
      </p>
      <blockquote className="mt-2 border-l-2 border-warning/40 pl-3 text-[11px] leading-5 text-ink-600">
        {snapshot.exact_excerpt}
      </blockquote>
    </>
  );
  const className =
    "block rounded-lg border border-warning/20 bg-card p-3";

  return snapshot.source_url ? (
    <a
      className={className}
      href={snapshot.source_url}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function MultiRequestReviewSections({
  citations,
  evidenceSnapshots,
  factualRequests,
  linkedQuestions,
}: {
  citations: Citation[];
  evidenceSnapshots: EvidenceSnapshotReview[];
  factualRequests: FactualRequestReview[];
  linkedQuestions: LinkedQuestion[];
}) {
  return (
    <div className="mt-3 space-y-4">
      {factualRequests.map((request) => {
        const requestCitations = citations.filter(
          ({ factual_request_id }) => factual_request_id === request.id,
        );
        const requestSnapshots = evidenceSnapshots.filter(
          ({ factual_request_id }) => factual_request_id === request.id,
        );
        const requestQuestion = linkedQuestions.find(
          ({ factual_request_id }) => factual_request_id === request.id,
        );
        const presentation = requestReviewPresentation(request);

        return (
          <section
            className="rounded-lg border border-line bg-card p-4"
            key={request.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-forest-950">
                {request.request_order}. {request.original_text}
              </h3>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  presentation.className,
                )}
              >
                {presentation.label}
              </span>
            </div>
            <div className="mt-3 text-[13px] leading-6 text-ink-700">
              <ControlledMarkdown>
                {request.response_content ?? "未保存逐项响应正文"}
              </ControlledMarkdown>
            </div>

            {requestCitations.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[11px] font-semibold text-ink-600">
                  {request.coverage_status === "conflicting"
                    ? "冲突来源"
                    : "回答依据"}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {requestCitations.map((citation) => (
                    <CitationCard citation={citation} key={citation.id} />
                  ))}
                </div>
              </div>
            ) : null}

            {requestSnapshots.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {requestSnapshots.map((snapshot) => (
                  <ConflictSnapshotCard
                    key={snapshot.id}
                    snapshot={snapshot}
                  />
                ))}
              </div>
            ) : null}

            {request.completeness === "incomplete" ? (
              <p className="mt-3 text-[11px] text-info">
                第 {request.clarification_round} 轮 · 仍缺少：
                {request.missing_information.join("、")}
              </p>
            ) : null}

            {requestQuestion ? (
              <Link
                className="mt-3 inline-flex text-[11px] font-semibold text-warning hover:underline"
                href={`/admin/unresolved-questions?status=${requestQuestion.status}&question=${requestQuestion.id}`}
              >
                查看此诉求的
                {requestQuestion.status === "pending" ? "待处理" : "已解决"}
                问题
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function requestReviewPresentation(request: FactualRequestReview) {
  if (request.coverage_status === "supported") {
    return {
      label: "已回答",
      className: "border-success/25 bg-success-light text-success",
    };
  }
  if (request.coverage_status === "unsupported") {
    return {
      label: "暂无法确认",
      className: "border-warning/25 bg-warning-light text-warning",
    };
  }
  if (request.coverage_status === "conflicting") {
    return {
      label: "知识存在冲突",
      className: "border-warning/25 bg-warning-light text-warning",
    };
  }
  return {
    label: request.response_status === "handoff"
      ? "需要人工协助"
      : "需要补充信息",
    className: "border-info/25 bg-info-light text-info",
  };
}

function ResultHeading({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "warning" | "danger" | "info";
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[12px] font-semibold",
        tone === "warning"
          ? "text-warning"
          : tone === "danger"
            ? "text-danger"
            : "text-info",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </p>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  const content = (
    <>
      <FileText aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">
          {citation.source_title}
        </span>
        <span className="mono mt-0.5 block truncate text-[10px] text-ink-400">
          {citation.source_url ?? "回答时未保存地址"}
        </span>
      </span>
      {citation.source_url ? (
        <ExternalLink aria-hidden="true" className="size-3.5 text-ink-400" />
      ) : null}
    </>
  );
  const className =
    "flex min-h-11 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2";

  return citation.source_url ? (
    <a
      className={className}
      href={citation.source_url}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function getAssistantResultType(
  message: Message,
): ConversationReviewResultType | null {
  if (
    message.message_type === "visitor_question" ||
    message.message_type === "answer_retry"
  ) {
    return null;
  }

  return message.message_type;
}

function countQuestions(messages: Message[]) {
  return messages.filter(
    ({ message_type }) => message_type === "visitor_question",
  ).length;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
