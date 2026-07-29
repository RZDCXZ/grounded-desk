"use client";

import {
  Check,
  Info,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { BrandMark } from "@/components/admin/brand-mark";
import { CitationList } from "@/components/assistant/citation-list";
import { ControlledMarkdown } from "@/components/assistant/controlled-markdown";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { GroundedCitation } from "@/lib/assistant/grounded-answer";
import type { PublicConversationBlockReason } from "@/lib/assistant/public-conversation";
import type { QualityFeedbackValue } from "@/lib/assistant/quality-feedback";
import { consumeAssistantResponseStream } from "@/lib/assistant/response-stream";
import { cn } from "@/lib/utils";

import type { PublicAssistant } from "./page";

type ConversationResult = {
  id: string;
  status:
    | "streaming"
    | "complete"
    | "refusal"
    | "temporary_failure"
    | "limit";
  question: string;
  answer: string;
  citations: GroundedCitation[];
  messageId?: string;
  feedback?: QualityFeedbackValue;
  feedbackStatus?: "submitting" | "error";
  code?: PublicConversationBlockReason;
  canStartNewConversation?: boolean;
  retryFailedAnswer?: boolean;
  message?: string;
  contact?: {
    label: string;
    url: string;
  };
};

export function PublicConversation({
  assistant,
  embedded = false,
  publicId,
}: {
  assistant: PublicAssistant;
  embedded?: boolean;
  publicId: string;
}) {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [results, setResults] = useState<ConversationResult[]>([]);
  const messagesViewport = useRef<HTMLDivElement | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const currentResult = results.at(-1);
  const requestPending = results.some(
    ({ status }) => status === "streaming",
  );
  const conversationLimited = currentResult?.status === "limit";

  useEffect(() => {
    if (!embedded || !messagesViewport.current) {
      return;
    }

    messagesViewport.current.scrollTop =
      messagesViewport.current.scrollHeight;
  }, [embedded, results]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestAnswer(question.trim());
  }

  async function requestAnswer(
    normalizedQuestion: string,
    resultId = crypto.randomUUID(),
    retry = false,
  ) {
    if (!normalizedQuestion || requestPending) {
      return;
    }

    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    const pendingResult: ConversationResult = {
      id: resultId,
      status: "streaming",
      question: normalizedQuestion,
      answer: "",
      citations: [],
    };
    setResults((current) => {
      const retryIndex = current.findIndex(({ id }) => id === resultId);
      return retryIndex < 0
        ? [...current, pendingResult]
        : current.map((result, index) =>
            index === retryIndex ? pendingResult : result,
          );
    });
    setQuestion("");

    try {
      const response = await fetch(
        `/api/public/assistants/${encodeURIComponent(publicId)}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            question: normalizedQuestion,
            conversationId,
            retry: retry || undefined,
          }),
          signal: controller.signal,
        },
      );

      const returnedConversationId = response.headers.get(
        "x-conversation-id",
      );
      if (returnedConversationId) {
        setConversationId(returnedConversationId);
      }
      const returnedMessageId = response.headers.get(
        "x-assistant-message-id",
      );
      if (returnedMessageId) {
        updateResult(resultId, (current) => ({
          ...current,
          messageId: returnedMessageId,
        }));
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: PublicConversationBlockReason;
          message?: string;
          conversationId?: string;
          canStartNewConversation?: boolean;
          contact?: {
            label: string;
            url: string;
          };
        } | null;
        if (payload?.conversationId) {
          setConversationId(payload.conversationId);
        }
        updateResult(resultId, (current) => ({
          ...current,
          status:
            payload?.code === "daily_budget" ||
            payload?.canStartNewConversation
              ? "limit"
              : "temporary_failure",
          code: payload?.code,
          message:
            payload?.message ?? "暂时无法完成咨询，请稍后重试。",
          canStartNewConversation:
            payload?.canStartNewConversation,
          retryFailedAnswer: false,
          contact: payload?.contact ?? {
            label: assistant.human_contact_label,
            url: assistant.human_contact_url,
          },
        }));
        return;
      }

      if (!response.body) {
        throw new Error("暂时无法完成咨询，请稍后重试。");
      }

      await consumeAssistantResponseStream(response.body, (streamEvent) => {
        if (streamEvent.type === "text_delta") {
          updateResult(resultId, (current) => ({
            ...current,
            answer: current.answer + streamEvent.delta,
          }));
          return;
        }

        if (streamEvent.type === "complete") {
          updateResult(resultId, (current) => ({
            ...current,
            status: "complete",
            citations: streamEvent.citations,
          }));
          return;
        }

        if (streamEvent.type === "refusal") {
          updateResult(resultId, (current) => ({
            ...current,
            status: "refusal",
            message: streamEvent.message,
            contact: streamEvent.contact,
          }));
          return;
        }

        updateResult(resultId, (current) => ({
          ...current,
          status: "temporary_failure",
          message: streamEvent.message,
          contact: streamEvent.contact,
          retryFailedAnswer: true,
        }));
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      updateResult(resultId, (current) => ({
        ...current,
        status: "temporary_failure",
        message:
          error instanceof Error
            ? error.message
            : "暂时无法完成咨询，请稍后重试。",
        contact: {
          label: assistant.human_contact_label,
          url: assistant.human_contact_url,
        },
        retryFailedAnswer: false,
      }));
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  function updateResult(
    resultId: string,
    update: (current: ConversationResult) => ConversationResult,
  ) {
    setResults((current) =>
      current.map((result) =>
        result.id === resultId ? update(result) : result,
      ),
    );
  }

  function startNewConversation() {
    requestController.current?.abort();
    requestController.current = null;
    setConversationId(undefined);
    setResults([]);
    setQuestion("");
  }

  async function submitFeedback(
    resultId: string,
    messageId: string,
    value: QualityFeedbackValue,
  ) {
    updateResult(resultId, (current) => ({
      ...current,
      feedbackStatus: "submitting",
    }));

    try {
      const response = await fetch(
        `/api/public/assistants/${encodeURIComponent(publicId)}/messages/${encodeURIComponent(messageId)}/feedback`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
        },
      );

      if (!response.ok) {
        throw new Error("暂时无法记录质量反馈，请稍后重试。");
      }

      updateResult(resultId, (current) => ({
        ...current,
        feedback: value,
        feedbackStatus: undefined,
      }));
    } catch {
      updateResult(resultId, (current) => ({
        ...current,
        feedbackStatus: "error",
      }));
    }
  }

  return (
    <main
      className={cn(
        "page-enter bg-paper",
        embedded ? "h-dvh overflow-hidden" : "min-h-screen",
      )}
    >
      {!embedded ? <header className="border-b border-line bg-card">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <BrandMark />
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-semibold text-ink-600">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-success"
            />
            AI 助手
          </span>
        </div>
      </header> : null}

      <div
        className={cn(
          "mx-auto max-w-3xl",
          embedded ? "h-full p-0" : "px-4 py-6 sm:px-5 sm:py-10",
        )}
      >
        <section
          className={cn(
            "overflow-hidden bg-card",
            embedded
              ? "flex h-full min-h-0 flex-col"
              : "rounded-xl border border-line",
          )}
        >
          <div
            className={cn(
              "bg-forest-950 px-5 py-6 text-white sm:px-7",
              embedded && "shrink-0",
            )}
            data-testid="assistant-header"
          >
            <div className="flex items-center gap-3">
              <AssistantIdentityMark />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">
                  {assistant.name}
                </h1>
                <p className="mt-1 text-[12px] text-white/65">
                  依据已核查的知识回答
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "space-y-5 bg-paper/70 p-4 sm:p-6",
              embedded && "min-h-0 flex-1 overflow-y-auto",
            )}
            data-testid="conversation-scroll-region"
            ref={messagesViewport}
          >
            <div className="flex items-start gap-3">
              <AssistantIdentityMark tone="light" />
              <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-line bg-card p-4 text-sm leading-6">
                {assistant.welcome_message}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-info/25 bg-info-light p-4 text-[12px] leading-5 text-ink-600">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-info"
              />
              <p>
                这是 AI 助手。请勿提交身份证件、账户凭据、财务信息等敏感个人信息。
              </p>
            </div>

            {results.length > 0 ? (
              results.map((result) => (
                <div className="space-y-4" key={result.id}>
                  <div className="flex justify-end">
                    <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-forest-800 px-4 py-3 text-sm leading-6 text-white">
                      {result.question}
                    </div>
                  </div>
                  <AssistantResponse
                    onFeedback={(messageId, value) =>
                      void submitFeedback(result.id, messageId, value)
                    }
                    onRetry={() =>
                      void requestAnswer(
                        result.question,
                        result.id,
                        result.retryFailedAnswer ?? false,
                      )
                    }
                    onStartNewConversation={startNewConversation}
                    result={result}
                  />
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-line bg-card p-4">
                <p className="text-[11px] font-semibold text-ink-600">
                  可咨询范围
                </p>
                <p className="mt-2 text-[13px] leading-6">
                  {assistant.service_scope}
                </p>
              </div>
            )}

          </div>

          <form
            className={cn(
              "border-t border-line bg-card p-4 sm:p-5",
              embedded && "shrink-0",
            )}
            data-testid="conversation-composer"
            onSubmit={submitQuestion}
          >
            <label
              className="mb-2 block text-[13px] font-semibold"
              htmlFor="public-conversation-question"
            >
              咨询问题
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                autoComplete="off"
                className="min-h-20 resize-none bg-paper"
                disabled={requestPending || conversationLimited}
                id="public-conversation-question"
                maxLength={2000}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="请输入一个与服务相关的问题"
                value={question}
              />
              <Button
                aria-label={
                  requestPending
                    ? "正在生成回答"
                    : "发送问题"
                }
                disabled={
                  requestPending ||
                  conversationLimited ||
                  question.trim().length === 0
                }
                size="icon-large"
                type="submit"
              >
                {requestPending ? (
                  <Spinner label="正在生成回答" />
                ) : (
                  <Send aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              无需注册或提供姓名、邮箱、电话。请勿提交敏感个人信息。
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

function AssistantResponse({
  onFeedback,
  onRetry,
  onStartNewConversation,
  result,
}: {
  onFeedback: (
    messageId: string,
    value: QualityFeedbackValue,
  ) => void;
  onRetry: () => void;
  onStartNewConversation: () => void;
  result: ConversationResult;
}) {
  return (
    <div className="flex items-start gap-3">
      <AssistantIdentityMark tone="light" />
      <div
        className={cn(
          "min-w-0 flex-1 rounded-xl rounded-tl-sm border bg-card p-4",
          result.status === "temporary_failure"
            ? "border-danger/30 bg-danger-light"
            : result.status === "limit"
              ? "border-info/30 bg-info-light"
            : result.status === "refusal"
              ? "border-warning/30 bg-warning-light"
              : "border-line",
        )}
      >
        {result.status === "limit" ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium text-info">
              <Info aria-hidden="true" className="size-4" />
              {result.code === "daily_budget"
                ? "今日 AI 咨询已暂停"
                : "当前会话需要重新开始"}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-ink-600">
              {result.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.canStartNewConversation ? (
                <Button
                  onClick={onStartNewConversation}
                  type="button"
                  variant="secondary"
                >
                  <MessageSquarePlus aria-hidden="true" />
                  开始新会话
                </Button>
              ) : null}
              <ContactLink contact={result.contact} />
            </div>
          </>
        ) : result.status === "temporary_failure" ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
              <Info aria-hidden="true" className="size-4" />
              服务暂时不可用
            </p>
            <p className="mt-2 text-[13px] leading-6 text-ink-600">
              {result.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onRetry} type="button" variant="secondary">
                重试
              </Button>
              <ContactLink contact={result.contact} />
            </div>
          </>
        ) : result.status === "refusal" ? (
          <>
            <p className="text-[13px] font-medium text-warning">
              现有知识暂时无法确认
            </p>
            <p className="mt-2 text-[13px] leading-6 text-ink-600">
              {result.message}
            </p>
            <ContactLink contact={result.contact} className="mt-3" />
          </>
        ) : (
          <>
            <div className="text-sm leading-6">
              <ControlledMarkdown>{result.answer}</ControlledMarkdown>
              {result.status === "streaming" ? (
                <Spinner
                  className="ml-1 inline size-3 align-text-bottom text-forest-800"
                  label="正在生成回答"
                />
              ) : null}
            </div>
            {result.status === "complete" ? (
              <CitationList citations={result.citations} />
            ) : null}
          </>
        )}
        {(result.status === "complete" ||
          result.status === "refusal") &&
        result.messageId ? (
          <QualityFeedbackControls
            feedback={result.feedback}
            messageId={result.messageId}
            onFeedback={onFeedback}
            status={result.feedbackStatus}
          />
        ) : null}
      </div>
    </div>
  );
}

function QualityFeedbackControls({
  feedback,
  messageId,
  onFeedback,
  status,
}: {
  feedback?: QualityFeedbackValue;
  messageId: string;
  onFeedback: (
    messageId: string,
    value: QualityFeedbackValue,
  ) => void;
  status?: "submitting" | "error";
}) {
  const disabled = Boolean(feedback) || status === "submitting";

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="评价这条助手回答"
          className="flex items-center gap-2"
          role="group"
        >
          <Button
            aria-pressed={feedback === "helpful"}
            className={cn(
              "text-xs",
              feedback === "helpful" &&
                "border-success bg-success-light text-success",
            )}
            disabled={disabled}
            onClick={() => onFeedback(messageId, "helpful")}
            type="button"
            variant="secondary"
          >
            {feedback === "helpful" ? (
              <Check aria-hidden="true" />
            ) : (
              <ThumbsUp aria-hidden="true" />
            )}
            有帮助
          </Button>
          <Button
            aria-pressed={feedback === "unhelpful"}
            className={cn(
              "text-xs",
              feedback === "unhelpful" &&
                "border-danger bg-danger-light text-danger",
            )}
            disabled={disabled}
            onClick={() => onFeedback(messageId, "unhelpful")}
            type="button"
            variant="secondary"
          >
            {feedback === "unhelpful" ? (
              <Check aria-hidden="true" />
            ) : (
              <ThumbsDown aria-hidden="true" />
            )}
            没帮助
          </Button>
        </div>
        {feedback ? (
          <p className="text-[11px] font-medium text-success" role="status">
            已记录，感谢反馈
          </p>
        ) : status === "submitting" ? (
          <Spinner label="正在记录质量反馈" />
        ) : null}
      </div>
      {status === "error" ? (
        <p className="mt-2 text-[11px] text-danger" role="alert">
          暂时无法记录质量反馈，请重试。
        </p>
      ) : null}
    </div>
  );
}

function ContactLink({
  className,
  contact,
}: {
  className?: string;
  contact?: { label: string; url: string };
}) {
  return contact ? (
    <Button asChild className={className} variant="secondary">
      <a href={contact.url} rel="noreferrer" target="_blank">
        {contact.label}
      </a>
    </Button>
  ) : null;
}

function AssistantIdentityMark({
  tone = "dark",
}: {
  tone?: "dark" | "light";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border",
        tone === "dark"
          ? "border-white/20 bg-white/10"
          : "border-forest-800/20 bg-forest-100",
      )}
    >
      <span
        className={cn(
          "size-3 border",
          tone === "dark" ? "border-white" : "border-forest-800",
        )}
      />
    </span>
  );
}
