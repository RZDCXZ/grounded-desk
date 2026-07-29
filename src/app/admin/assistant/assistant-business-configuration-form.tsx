"use client";

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  MessageCircle,
  Send,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatusBadge, type Status } from "@/components/admin/status-badge";
import { CitationList } from "@/components/assistant/citation-list";
import { ControlledMarkdown } from "@/components/assistant/controlled-markdown";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  type AssistantBusinessConfigurationActionState,
  type AssistantBusinessConfigurationRecord,
  type AssistantBusinessConfigurationValues,
  type AssistantTone,
} from "@/lib/assistant/business-configuration";
import type { GroundedCitation } from "@/lib/assistant/grounded-answer";
import { consumeAssistantResponseStream } from "@/lib/assistant/response-stream";
import { cn } from "@/lib/utils";

import {
  publishAssistant,
  takeAssistantOffline,
  updateAssistantBusinessConfiguration,
} from "./actions";

const initialActionState: AssistantBusinessConfigurationActionState = {
  status: "idle",
};

type PreviewResult = {
  status:
    | "idle"
    | "streaming"
    | "complete"
    | "refusal"
    | "temporary_failure";
  question: string;
  answer: string;
  citations: GroundedCitation[];
  message?: string;
  failureReason?: "input_rejected" | "rate_limited" | "provider_failure";
  contact?: {
    label: string;
    url: string;
  };
};

const toneOptions: Array<{
  value: AssistantTone;
  label: string;
  description: string;
}> = [
  {
    value: "professional",
    label: "专业",
    description: "严谨、结构清楚",
  },
  {
    value: "friendly",
    label: "友好",
    description: "亲切、自然",
  },
  {
    value: "concise",
    label: "简洁",
    description: "精炼、直达重点",
  },
];

export function AssistantBusinessConfigurationForm({
  assistant,
  publicUrl,
}: {
  assistant: AssistantBusinessConfigurationRecord;
  publicUrl: string | null;
}) {
  const [actionState, formAction, pending] = useActionState(
    updateAssistantBusinessConfiguration,
    initialActionState,
  );
  const [values, setValues] = useState<AssistantBusinessConfigurationValues>({
    name: assistant.name,
    welcomeMessage: assistant.welcome_message,
    serviceScope: assistant.service_scope,
    tone: assistant.tone,
    humanContactLabel: assistant.human_contact_label,
    humanContactUrl: assistant.human_contact_url,
  });
  const errors = actionState.status === "error" ? actionState.errors : {};

  function updateValue(
    field: keyof AssistantBusinessConfigurationValues,
    value: string,
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
  }

  return (
    <main className="page-enter min-h-screen">
      <AdminPageHeader
        actions={
          <>
            <StatusBadge status={assistant.status} />
            <PublicationAction status={assistant.status} />
            <Button
              disabled={pending}
              form="assistant-business-configuration"
              type="submit"
            >
              {pending ? "正在保存…" : "保存更改"}
            </Button>
          </>
        }
        description="定义访客可见的助手身份、沟通方式和人工联系入口"
        title="助手配置"
      />

      <div className="mx-auto grid max-w-300 gap-7 p-5 sm:p-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-7">
          <form
            action={formAction}
            className="space-y-6"
            id="assistant-business-configuration"
            noValidate
          >
            {actionState.status !== "idle" ? (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-[13px]",
                  actionState.status === "success"
                    ? "border-success/30 bg-success-light text-success"
                    : "border-danger/30 bg-danger-light text-danger",
                )}
                role={actionState.status === "success" ? "status" : "alert"}
              >
                {actionState.status === "success" ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                )}
                <p>{actionState.message}</p>
              </div>
            ) : null}

            <ConfigurationSection
              icon={UserCog}
              title="基础信息"
            >
              <Field invalid={Boolean(errors.name)}>
                <FieldLabel>助手名称</FieldLabel>
                <Input
                  maxLength={80}
                  name="name"
                  onChange={(event) => updateValue("name", event.target.value)}
                  placeholder="访客看到的助手身份名称"
                  required
                  value={values.name}
                />
                <FieldDescription>显示在访客会话顶部。</FieldDescription>
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>

              <Field invalid={Boolean(errors.welcomeMessage)}>
                <FieldLabel>欢迎语</FieldLabel>
                <Textarea
                  className="min-h-24"
                  maxLength={500}
                  name="welcomeMessage"
                  onChange={(event) =>
                    updateValue("welcomeMessage", event.target.value)
                  }
                  placeholder="访客开始会话时看到的第一句话"
                  required
                  value={values.welcomeMessage}
                />
                {errors.welcomeMessage ? (
                  <FieldError>{errors.welcomeMessage}</FieldError>
                ) : null}
              </Field>

              <Field invalid={Boolean(errors.serviceScope)}>
                <FieldLabel>服务范围说明</FieldLabel>
                <Textarea
                  maxLength={1000}
                  name="serviceScope"
                  onChange={(event) =>
                    updateValue("serviceScope", event.target.value)
                  }
                  placeholder="说明助手可以处理哪些咨询"
                  required
                  value={values.serviceScope}
                />
                <FieldDescription>
                  使用清楚的业务边界，帮助访客判断是否适合继续咨询。
                </FieldDescription>
                {errors.serviceScope ? (
                  <FieldError>{errors.serviceScope}</FieldError>
                ) : null}
              </Field>
            </ConfigurationSection>

            <ConfigurationSection icon={MessageCircle} title="沟通方式">
            <Field invalid={Boolean(errors.tone)}>
              <fieldset>
                <legend className="text-[13px] leading-5 font-semibold">
                  回答语气
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {toneOptions.map((option) => {
                    const selected = values.tone === option.value;

                    return (
                      <label
                        className={cn(
                          "relative flex min-h-20 items-center justify-center rounded-lg border p-3 text-center transition-colors",
                          selected
                            ? "border-forest-800 bg-forest-100/60"
                            : "border-line-strong bg-card hover:bg-paper",
                        )}
                        key={option.value}
                      >
                        <input
                          aria-label={option.label}
                          checked={selected}
                          className="peer sr-only"
                          name="tone"
                          onChange={() => updateValue("tone", option.value)}
                          type="radio"
                          value={option.value}
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest-800"
                        />
                        <span className="relative">
                          <span className="block text-sm font-medium">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-[11px] text-ink-600">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {errors.tone ? <FieldError>{errors.tone}</FieldError> : null}
            </Field>

            <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
              <Field invalid={Boolean(errors.humanContactLabel)}>
                <FieldLabel>人工联系入口文案</FieldLabel>
                <Input
                  maxLength={80}
                  name="humanContactLabel"
                  onChange={(event) =>
                    updateValue("humanContactLabel", event.target.value)
                  }
                  placeholder="例如：联系业务团队"
                  required
                  value={values.humanContactLabel}
                />
                {errors.humanContactLabel ? (
                  <FieldError>{errors.humanContactLabel}</FieldError>
                ) : null}
              </Field>

              <Field invalid={Boolean(errors.humanContactUrl)}>
                <FieldLabel>人工联系 URL</FieldLabel>
                <Input
                  inputMode="url"
                  maxLength={2048}
                  name="humanContactUrl"
                  onChange={(event) =>
                    updateValue("humanContactUrl", event.target.value)
                  }
                  placeholder="https://… 或 mailto:…"
                  required
                  type="text"
                  value={values.humanContactUrl}
                />
                {errors.humanContactUrl ? (
                  <FieldError>{errors.humanContactUrl}</FieldError>
                ) : null}
              </Field>
            </div>
            </ConfigurationSection>

            <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-light p-4 text-[13px] text-ink-600">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-info"
              />
              <div>
                <p className="font-medium text-ink-900">配置边界</p>
                <p className="mt-1">
                  本页只配置访客可见内容；技术与安全设置由系统统一管理。
                </p>
              </div>
            </div>
          </form>

          <PublicationPanel
            publicUrl={publicUrl}
            status={assistant.status}
          />
        </div>

        <AssistantPreview
          status={assistant.status}
          values={values}
        />
      </div>
    </main>
  );
}

function PublicationAction({
  status,
}: {
  status: AssistantBusinessConfigurationRecord["status"];
}) {
  const action =
    status === "published" ? takeAssistantOffline : publishAssistant;

  return (
    <form action={action}>
      <PublicationSubmitButton status={status} />
    </form>
  );
}

function PublicationSubmitButton({
  status,
}: {
  status: AssistantBusinessConfigurationRecord["status"];
}) {
  const { pending } = useFormStatus();
  const label =
    status === "published"
      ? "下线助手"
      : status === "offline"
        ? "重新发布助手"
        : "发布助手";

  return (
    <Button
      disabled={pending}
      type="submit"
      variant={status === "published" ? "destructive" : "secondary"}
    >
      {pending ? "正在更新…" : label}
    </Button>
  );
}

function PublicationPanel({
  publicUrl,
  status,
}: {
  publicUrl: string | null;
  status: AssistantBusinessConfigurationRecord["status"];
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const publiclyAvailable = status === "published" && publicUrl;

  async function copyPublicUrl() {
    if (!publicUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
      <h2 className="text-lg font-[650]">发布与访问</h2>
      {publiclyAvailable ? (
        <div className="mt-5 rounded-lg border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold">公开会话链接</p>
              <p className="mt-1 text-[11px] text-ink-600">
                访客无需账户即可开始匿名会话。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void copyPublicUrl()}
                type="button"
                variant="secondary"
              >
                <Copy aria-hidden="true" />
                复制公开链接
              </Button>
              <Button asChild variant="secondary">
                <a href={publicUrl} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" />
                  打开公开页面
                </a>
              </Button>
            </div>
          </div>
          <p className="mono mt-3 break-all rounded border border-line bg-card px-3 py-2 text-[12px] text-ink-600">
            {publicUrl}
          </p>
          {copyStatus !== "idle" ? (
            <p
              className={cn(
                "mt-2 text-[11px]",
                copyStatus === "copied" ? "text-success" : "text-danger",
              )}
              role="status"
            >
              {copyStatus === "copied"
                ? "公开链接已复制。"
                : "无法自动复制，请手动复制链接。"}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-line bg-paper p-4 text-[13px] text-ink-600">
          {status === "draft"
            ? "草稿助手尚无公开入口，首次发布时会生成固定公开 ID。"
            : "助手已下线，原公开链接暂时不可访问；重新发布会继续使用原链接。"}
        </div>
      )}
    </section>
  );
}

function ConfigurationSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof UserCog;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
      <h2 className="mb-6 flex items-center gap-2 text-lg font-[650]">
        <Icon
          aria-hidden="true"
          className="size-5 text-forest-800"
          strokeWidth={1.7}
        />
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function AssistantPreview({
  status,
  values,
}: {
  status: Extract<Status, "draft" | "published" | "offline">;
  values: AssistantBusinessConfigurationValues;
}) {
  const toneLabel =
    toneOptions.find(({ value }) => value === values.tone)?.label ?? "未选择";
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PreviewResult>({
    status: "idle",
    question: "",
    answer: "",
    citations: [],
  });
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestController.current?.abort();
    };
  }, []);

  async function submitPreviewQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestPreview(question.trim());
  }

  async function requestPreview(normalizedQuestion: string) {
    if (!normalizedQuestion || result.status === "streaming") {
      return;
    }

    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setResult({
      status: "streaming",
      question: normalizedQuestion,
      answer: "",
      citations: [],
    });

    try {
      const response = await fetch("/api/admin/assistant/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: normalizedQuestion }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "暂时无法完成预览，请稍后重试。");
      }

      await consumeAssistantResponseStream(response.body, (streamEvent) => {
        if (streamEvent.type === "text_delta") {
          setResult((current) => ({
            ...current,
            answer: current.answer + streamEvent.delta,
          }));
          return;
        }

        if (streamEvent.type === "complete") {
          setResult((current) => ({
            ...current,
            status: "complete",
            citations: streamEvent.citations,
          }));
          return;
        }

        if (streamEvent.type === "refusal") {
          setResult((current) => ({
            ...current,
            status: "refusal",
            message: streamEvent.message,
            contact: streamEvent.contact,
          }));
          return;
        }

        setResult((current) => ({
          ...current,
          status: "temporary_failure",
          failureReason: streamEvent.reason,
          message: streamEvent.message,
          contact: streamEvent.contact,
        }));
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setResult((current) => ({
        ...current,
        status: "temporary_failure",
        failureReason: "provider_failure",
        message:
          error instanceof Error
            ? error.message
            : "暂时无法完成预览，请稍后重试。",
        contact: {
          label: values.humanContactLabel,
          url: values.humanContactUrl,
        },
      }));
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  return (
    <aside className="xl:col-span-5" aria-label="助手后台预览">
      <div className="xl:sticky xl:top-28">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">后台预览</p>
            <p className="mt-0.5 text-[11px] text-ink-600">
              使用已保存配置与当前可用知识
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mx-auto max-w-100 overflow-hidden rounded-xl border border-line bg-card">
          <div className="flex items-center gap-3 bg-forest-950 p-5 text-white">
            <AssistantIdentityMark size="large" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {values.name.trim() || "助手名称"}
              </p>
              <p className="mt-0.5 text-[11px] text-white/65">
                AI 助手 · {toneLabel}语气
              </p>
            </div>
          </div>

          <div
            aria-live="polite"
            className="min-h-118 space-y-5 bg-paper/70 p-5"
          >
            <div className="flex items-start gap-3">
              <AssistantIdentityMark />
              <div className="rounded-xl rounded-tl-sm border border-line bg-card p-4 text-sm leading-6">
                {values.welcomeMessage.trim() || "欢迎语会显示在这里。"}
              </div>
            </div>

            {result.question ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-forest-800 px-4 py-3 text-sm leading-6 text-white">
                  {result.question}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-card p-4">
                <p className="text-[11px] font-semibold text-ink-600">
                  可服务范围
                </p>
                <p className="mt-2 text-[13px] leading-6">
                  {values.serviceScope.trim() ||
                    "服务范围说明会帮助访客了解可咨询内容。"}
                </p>
              </div>
            )}

            {result.status !== "idle" ? (
              <div className="flex items-start gap-3">
                <AssistantIdentityMark />
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-xl rounded-tl-sm border bg-card p-4",
                    result.status === "temporary_failure"
                      ? "border-danger/30 bg-danger-light"
                      : result.status === "refusal"
                        ? "border-warning/30 bg-warning-light"
                      : "border-line",
                  )}
                >
                  {result.status === "temporary_failure" ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-danger">
                          服务暂时不可用
                        </p>
                        <span className="mono rounded-full border border-danger/25 bg-card px-2 py-0.5 text-[10px] font-semibold text-danger">
                          {temporaryFailureLabel(result.failureReason)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-6 text-ink-600">
                        {result.message}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => void requestPreview(result.question)}
                          type="button"
                          variant="secondary"
                        >
                          重试预览
                        </Button>
                        {result.contact ? (
                          <Button asChild variant="secondary">
                            <a
                              href={result.contact.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {result.contact.label}
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : result.status === "refusal" ? (
                    <>
                      <p className="text-[13px] font-medium text-warning">
                        现有知识暂时无法确认
                      </p>
                      <p className="mt-1 text-[13px] leading-6 text-ink-600">
                        {result.message}
                      </p>
                      {result.contact ? (
                        <a
                          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-line-strong bg-card px-3 text-[13px] font-medium text-forest-800 transition-colors hover:bg-paper"
                          href={result.contact.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {result.contact.label}
                        </a>
                      ) : null}
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
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-line bg-card p-4"
            onSubmit={submitPreviewQuestion}
          >
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="assistant-preview-question">
                预览问题
              </label>
              <Input
                autoComplete="off"
                className="bg-paper"
                disabled={result.status === "streaming"}
                id="assistant-preview-question"
                maxLength={2000}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="输入一个有知识依据的问题"
                value={question}
              />
              <Button
                aria-label={
                  result.status === "streaming" ? "正在生成回答" : "发送问题"
                }
                disabled={
                  result.status === "streaming" || question.trim().length === 0
                }
                size="icon"
                type="submit"
              >
                <Send aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              管理员预览不会创建访客会话。请勿提交敏感个人信息。
            </p>
          </form>
        </div>

        {status === "draft" ? (
          <p className="mx-auto mt-4 max-w-100 text-center text-[11px] leading-5 text-ink-600">
            草稿配置只在管理员后台可见；公开访问入口将在首次发布后生成。
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function temporaryFailureLabel(reason: PreviewResult["failureReason"]) {
  return {
    input_rejected: "输入被拒绝",
    rate_limited: "供应商限流",
    provider_failure: "供应商故障",
  }[reason ?? "provider_failure"];
}

function AssistantIdentityMark({ size = "default" }: { size?: "default" | "large" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border",
        size === "large"
          ? "size-10 border-white/20 bg-white/10"
          : "size-8 border-forest-800/20 bg-forest-100",
      )}
    >
      <span
        className={cn(
          "border",
          size === "large"
            ? "size-3 border-white"
            : "size-2.5 border-forest-800",
        )}
      />
    </span>
  );
}
