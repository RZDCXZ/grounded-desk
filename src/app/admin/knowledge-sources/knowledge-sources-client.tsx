"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import {
  createManualKnowledgeSource,
  type CreateManualSourceState,
} from "./actions";

const initialCreateState: CreateManualSourceState = { status: "idle" };

export function AddKnowledgeSource() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (previousState: CreateManualSourceState, formData: FormData) => {
      const nextState = await createManualKnowledgeSource(
        previousState,
        formData,
      );

      if (nextState.status === "created") {
        setOpen(false);
        router.refresh();
      }

      return nextState;
    },
    initialCreateState,
  );

  return (
    <>
      <button
        className="flex h-10 items-center gap-2 rounded-lg bg-(--forest-800) px-4 text-sm font-medium text-white transition-[filter] hover:brightness-95"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus className="size-4" aria-hidden="true" />
        添加知识来源
      </button>

      {open ? (
        <div
          aria-label="添加知识来源"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-(--forest-950)/20"
          role="dialog"
        >
          <button
            aria-label="关闭添加知识来源"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            type="button"
          />
          <section className="relative flex h-full w-full max-w-125 flex-col border-l border-(--line) bg-white shadow-[0_8px_24px_rgba(16,41,30,0.08)]">
            <div className="flex items-start justify-between border-b border-(--line) p-6">
              <div>
                <h2 className="text-xl font-bold text-(--forest-950)">
                  添加知识来源
                </h2>
                <p className="mt-1 text-[13px] text-(--ink-600)">
                  粘贴手工维护的业务知识，处理完成后即可参与回答。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="grid size-10 place-items-center rounded-lg text-(--ink-600) hover:bg-(--paper)"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div
              aria-label="知识来源类型"
              className="flex border-b border-(--line) px-6"
              role="tablist"
            >
              <button
                aria-selected="false"
                className="h-11 px-4 text-sm text-(--ink-400)"
                disabled
                role="tab"
                title="公开网页导入将在下一张工单开放"
                type="button"
              >
                网页 URL
              </button>
              <button
                aria-selected="true"
                className="h-11 border-b-2 border-(--forest-800) px-4 text-sm font-semibold text-(--forest-800)"
                role="tab"
                type="button"
              >
                手工内容
              </button>
            </div>

            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto p-6 sm:p-8">
                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold">
                    标题
                  </span>
                  <input
                    aria-label="标题"
                    className="h-10 w-full rounded-lg border border-(--line-strong) bg-(--paper) px-3 text-sm outline-none focus:border-(--forest-800)"
                    maxLength={160}
                    name="title"
                    placeholder="例如：售后服务说明"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold">
                    正文
                  </span>
                  <textarea
                    aria-label="正文"
                    className="min-h-64 w-full resize-y rounded-lg border border-(--line-strong) bg-(--paper) px-3 py-2.5 text-sm leading-6 outline-none focus:border-(--forest-800)"
                    name="body"
                    placeholder="使用清楚的标题与段落组织业务知识。"
                    required
                  />
                  <span className="mt-1.5 block text-[11px] text-(--ink-400)">
                    支持 80 至 50000 个字符；系统按标题与段落形成内容单元。
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold">
                    原始 URL（可选）
                  </span>
                  <input
                    aria-label="原始 URL（可选）"
                    className="h-10 w-full rounded-lg border border-(--line-strong) bg-(--paper) px-3 text-sm outline-none focus:border-(--forest-800)"
                    name="originalUrl"
                    maxLength={2048}
                    placeholder="https://example.com/services"
                    type="url"
                  />
                  <span className="mt-1.5 block text-[11px] text-(--ink-400)">
                    仅用于管理员识别和后续引用，不会自动抓取该地址。
                  </span>
                </label>

                {state.status === "error" ? (
                  <p
                    className="rounded-lg border border-(--danger)/20 bg-(--danger-light) p-3 text-[13px] text-(--danger)"
                    role="alert"
                  >
                    {state.message}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-3 border-t border-(--line) bg-(--paper) p-6">
                <button
                  className="h-10 rounded-lg border border-(--line-strong) bg-white px-5 text-sm font-medium text-(--ink-600)"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="h-10 rounded-lg bg-(--forest-800) px-6 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-65"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "正在添加…" : "确认添加"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
