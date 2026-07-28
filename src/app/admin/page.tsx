import {
  Bot,
  CheckCircle2,
  CircleHelp,
  Database,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  getStatusLabel,
  StatusBadge,
  type Status,
} from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdministrator } from "@/lib/auth/require-admin";
import { getThirtyDaysAgo } from "@/lib/time";

export default async function AdminOverviewPage() {
  const { supabase, organization } = await requireAdministrator();
  const thirtyDaysAgo = getThirtyDaysAgo();

  const [assistantResult, sourcesResult, conversationsResult, unresolvedResult] =
    await Promise.all([
      supabase
        .from("assistants")
        .select("name, status, welcome_message")
        .eq("organization_id", organization.id)
        .single(),
      supabase
        .from("knowledge_sources")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "available")
        .eq("enabled", true),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .gte("created_at", thirtyDaysAgo),
      supabase
        .from("unresolved_questions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "pending"),
    ]);

  const assistant = assistantResult.data;
  const assistantStatus = (assistant?.status ?? "draft") as Extract<
    Status,
    "draft" | "published" | "offline"
  >;
  const assistantStatusLabel = getStatusLabel(assistantStatus);
  const availableSources = sourcesResult.count ?? 0;
  const recentConversations = conversationsResult.count ?? 0;
  const pendingQuestions = unresolvedResult.count ?? 0;

  return (
    <main className="page-enter min-h-screen">
      <AdminPageHeader
        actions={
          <div className="hidden items-center gap-3 sm:flex">
            <Button
              disabled
              title="助手预览将在后续工单开放"
              type="button"
              variant="secondary"
            >
              预览助手
            </Button>
            <Button asChild>
              <Link href="/admin/knowledge-sources">添加知识来源</Link>
            </Button>
          </div>
        }
        description="管理从知识到回答再到改进的闭环状态"
        title="概览"
      />

      <div className="mx-auto max-w-300 space-y-7 p-5 sm:p-8">
        <section
          aria-label="系统初始统计"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            description="发布后访客才能开始咨询"
            label="助手状态"
            status={assistantStatus}
            value={assistantStatusLabel}
          />
          <MetricCard
            description={
              availableSources > 0
                ? "已启用并可参与后续有据回答"
                : "当前没有可参与回答的知识来源"
            }
            label="可用知识来源"
            value={String(availableSources).padStart(2, "0")}
          />
          <MetricCard
            description="种子环境尚未产生访客会话"
            label="最近 30 天会话"
            value={String(recentConversations).padStart(2, "0")}
          />
          <MetricCard
            description="来自可靠拒答或负面质量反馈"
            label="待处理问题"
            tone={pendingQuestions > 0 ? "warning" : "neutral"}
            value={String(pendingQuestions).padStart(2, "0")}
          />
        </section>

        <section className="grid grid-cols-1 gap-7 xl:grid-cols-12">
          <div className="rounded-xl border border-(--line) bg-white p-5 sm:p-6 xl:col-span-8">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-[650]">服务状态与闭环</h2>
              <span className="flex items-center gap-1.5 text-xs text-(--ink-600)">
                <CheckCircle2 className="size-4 text-(--success)" />
                管理员入口与组织边界已就绪
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:gap-2">
              <LoopStep
                detail={`${availableSources} 已启用`}
                icon={Database}
                label="知识来源"
              />
              <LoopStep
                detail={`助手为${assistantStatusLabel}`}
                icon={MessageSquareText}
                label="有据回答"
              />
              <LoopStep
                detail="等待访客评价"
                icon={CheckCircle2}
                label="质量反馈"
                muted
              />
              <LoopStep
                detail={`${pendingQuestions} 待处理`}
                icon={CircleHelp}
                label="待解决问题"
                muted
              />
              <LoopStep
                detail="持续迭代"
                icon={RefreshCw}
                label="更新知识"
                muted
              />
            </div>

            <div className="mt-8 flex items-center gap-3 rounded-lg border border-(--line) bg-(--paper) p-4">
              <span className="size-2 rounded-full bg-(--success)" />
              <p className="text-[13px] text-(--ink-600)">
                当前为可重建的演示基线；后续知识处理会在此显示最新状态。
              </p>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-(--line) bg-white xl:col-span-4">
            <div className="flex items-center justify-between border-b border-(--line) p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-(--forest-100) text-(--forest-800)">
                  <Bot className="size-4" strokeWidth={1.7} />
                </span>
                <span className="font-medium">默认助手</span>
              </div>
              <StatusBadge status={assistantStatus} />
            </div>

            <div className="flex-1 p-5">
              <p className="text-[11px] font-semibold text-(--ink-600)">
                演示数据
              </p>
              <h2 className="mt-2 text-lg font-[650] text-(--forest-950)">
                {assistant?.name ?? "演示网站服务助手"}
              </h2>
              <p className="mt-3 text-[13px] leading-6 text-(--ink-600)">
                {assistant?.welcome_message ??
                  "你好，我是 GroundedDesk 演示助手。你可以询问服务范围和支持方式。"}
              </p>
            </div>

            <div className="border-t border-(--line) p-4 text-xs text-(--ink-600)">
              添加并处理知识来源后即可预览与发布。
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-(--line) bg-white">
          <div className="border-b border-(--line) p-5">
            <h2 className="text-lg font-[650]">系统基线</h2>
          </div>
          <dl className="grid grid-cols-1 divide-y divide-(--line) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SystemFact label="组织" value={organization.name} />
            <SystemFact label="认证方式" value="真实 Magic Link" />
            <SystemFact label="数据边界" value="组织成员关系 + RLS" />
          </dl>
        </section>
      </div>
    </main>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  status?: Status;
  tone?: "neutral" | "warning";
};

function MetricCard({
  label,
  value,
  description,
  status,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <article className="flex min-h-34 flex-col justify-between rounded-xl border border-(--line) bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-(--ink-600)">
          {label}
        </span>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <div className="mt-4">
        <p
          className={`mono text-[30px] font-semibold leading-9 ${
            tone === "warning" ? "text-(--warning)" : ""
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-[11px] text-(--ink-600)">{description}</p>
      </div>
    </article>
  );
}

type LoopStepProps = {
  label: string;
  detail: string;
  icon: typeof Database;
  muted?: boolean;
};

function LoopStep({ label, detail, icon: Icon, muted = false }: LoopStepProps) {
  return (
    <div className="relative flex items-center gap-3 sm:flex-col sm:text-center">
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-full border ${
          muted
            ? "border-(--line-strong) text-(--ink-400)"
            : "border-(--forest-800) bg-(--forest-100) text-(--forest-800)"
        }`}
      >
        <Icon className="size-5" strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="mono mt-1 text-[10px] text-(--ink-600)">{detail}</p>
      </div>
    </div>
  );
}

function SystemFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <dt className="text-[11px] font-semibold text-(--ink-600)">{label}</dt>
      <dd className="mt-1 text-[13px] font-medium">{value}</dd>
    </div>
  );
}
