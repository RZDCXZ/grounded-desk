import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  ServerCrash,
  ThumbsDown,
  ThumbsUp,
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

import { DeleteConversationAction } from "./delete-conversation-action";

type MessageType =
  | "visitor_question"
  | "answer_retry"
  | "grounded_answer"
  | "grounded_refusal"
  | "technical_failure";
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
  trigger_type: "grounded_refusal" | "negative_feedback";
  status: "pending" | "resolved";
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

  const [messagesResult, citationsResult, feedbackResult, questionsResult] =
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
          "id, message_id, knowledge_source_id, source_title, source_url",
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
        .select("id, answer_message_id, trigger_type, status")
        .eq("organization_id", organization.id)
        .eq("conversation_id", conversationId),
    ]);
  const readError =
    messagesResult.error ??
    citationsResult.error ??
    feedbackResult.error ??
    questionsResult.error;

  if (readError) {
    throw new Error("暂时无法读取会话上下文", { cause: readError });
  }

  const messages = (messagesResult.data ?? []) as Message[];
  const citations = (citationsResult.data ?? []) as Citation[];
  const feedback = (feedbackResult.data ?? []) as Feedback[];
  const linkedQuestions = (questionsResult.data ?? []) as LinkedQuestion[];
  const selectedQuestion = linkedQuestions.find(
    ({ id }) => id === highlightedQuestionId,
  );
  const transcript = (
    <ConversationTranscript
      citations={citations}
      feedback={feedback}
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
  linkedQuestions,
  messages,
  selectedQuestion,
}: {
  citations: Citation[];
  feedback: Feedback[];
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
              highlighted={
                selectedQuestion?.answer_message_id === message.id
              }
              key={message.id}
              linkedQuestion={linkedQuestions.find(
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
  feedback,
  highlighted,
  linkedQuestion,
  message,
}: {
  citations: Citation[];
  feedback?: Feedback;
  highlighted: boolean;
  linkedQuestion?: LinkedQuestion;
  message: Message;
}) {
  const isPending = message.status === "pending";
  const isRefusal = message.message_type === "grounded_refusal";
  const isFailure = message.message_type === "technical_failure";

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
      </div>
      <div
        className={cn(
          "max-w-[94%] rounded-xl rounded-tl-sm border p-4",
          isPending
            ? "border-info/30 bg-info-light"
            : isFailure
              ? "border-danger/30 bg-danger-light"
              : isRefusal
                ? "border-warning/30 bg-warning-light"
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
        ) : isRefusal ? (
          <ResultHeading
            icon={AlertTriangle}
            label="可靠拒答"
            tone="warning"
          />
        ) : (
          <ResultHeading
            icon={CheckCircle2}
            label="有据回答"
            tone="success"
          />
        )}

        <div className="mt-3 text-sm leading-6">
          {isPending ? (
            <p>回答仍在生成中。</p>
          ) : (
            <ControlledMarkdown>{message.content}</ControlledMarkdown>
          )}
        </div>

        {citations.length > 0 ? (
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

        {feedback ? (
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

        {linkedQuestion ? (
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

function ResultHeading({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[12px] font-semibold",
        tone === "success"
          ? "text-success"
          : tone === "warning"
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
