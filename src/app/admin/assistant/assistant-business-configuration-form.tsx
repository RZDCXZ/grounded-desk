"use client";

import {
  CheckCircle2,
  ExternalLink,
  Info,
  MessageCircle,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { useActionState, useState } from "react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatusBadge, type Status } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AssistantBusinessConfigurationActionState,
  type AssistantBusinessConfigurationRecord,
  type AssistantBusinessConfigurationValues,
  type AssistantTone,
  isAllowedHumanContactUrl,
} from "@/lib/assistant/business-configuration";
import { cn } from "@/lib/utils";

import { updateAssistantBusinessConfiguration } from "./actions";

const initialActionState: AssistantBusinessConfigurationActionState = {
  status: "idle",
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
}: {
  assistant: AssistantBusinessConfigurationRecord;
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
        <form
          action={formAction}
          className="space-y-6 xl:col-span-7"
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

        <AssistantPreview
          status={assistant.status}
          values={values}
        />
      </div>
    </main>
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
  const contactUrlIsAllowed = isAllowedHumanContactUrl(
    values.humanContactUrl.trim(),
  );
  const toneLabel =
    toneOptions.find(({ value }) => value === values.tone)?.label ?? "未选择";

  return (
    <aside className="xl:col-span-5" aria-label="助手后台预览">
      <div className="xl:sticky xl:top-28">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">后台预览</p>
            <p className="mt-0.5 text-[11px] text-ink-600">
              输入内容会在此实时更新
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

          <div className="min-h-118 space-y-5 bg-paper/70 p-5">
            <div className="flex items-start gap-3">
              <AssistantIdentityMark />
              <div className="rounded-xl rounded-tl-sm border border-line bg-card p-4 text-sm leading-6">
                {values.welcomeMessage.trim() || "欢迎语会显示在这里。"}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-[11px] font-semibold text-ink-600">
                可服务范围
              </p>
              <p className="mt-2 text-[13px] leading-6">
                {values.serviceScope.trim() ||
                  "服务范围说明会帮助访客了解可咨询内容。"}
              </p>
            </div>

            <div className="rounded-lg border border-warning/30 bg-warning-light p-4">
              <p className="text-[13px] leading-6">
                如果现有内容暂时无法确认，访客可以继续联系人工。
              </p>
              {contactUrlIsAllowed ? (
                <a
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-[13px] font-medium text-forest-800 hover:bg-paper"
                  href={values.humanContactUrl.trim()}
                  rel="noreferrer"
                  target={
                    values.humanContactUrl.trim().startsWith("mailto:")
                      ? undefined
                      : "_blank"
                  }
                >
                  {values.humanContactLabel.trim() || "联系人工"}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ) : (
                <span className="mt-3 inline-flex h-10 items-center rounded-lg border border-line-strong bg-card px-4 text-[13px] font-medium text-ink-600">
                  {values.humanContactLabel.trim() || "联系人工"}
                </span>
              )}
            </div>
          </div>
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
