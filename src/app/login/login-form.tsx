"use client";

import { Mail, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type LoginFormProps = {
  adminEmail: string;
  invalidLink: boolean;
};

export function LoginForm({ adminEmail, invalidLink }: LoginFormProps) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<
    "idle" | "submitting" | "sent" | "error"
  >(invalidLink ? "error" : "idle");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="page-enter w-full max-w-110 rounded-xl border border-(--line) bg-white p-8 sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-(--forest-950) text-white">
            <span className="size-3 border border-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.02em] text-(--forest-950)">
            GroundedDesk
          </span>
        </div>

        <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-(--forest-950)">
          进入 GroundedDesk
        </h1>
        <p className="mt-2 text-sm text-(--ink-600)">
          使用预配置管理员邮箱获取一次性登录链接。
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium">
              管理员邮箱
            </span>
            <span className="flex h-11 items-center gap-3 rounded-lg border border-(--line-strong) bg-(--paper) px-3">
              <Mail className="size-4 text-(--ink-400)" aria-hidden="true" />
              <input
                aria-label="管理员邮箱"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                name="email"
                readOnly
                type="email"
                value={adminEmail}
              />
            </span>
          </label>

          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--forest-800) px-4 text-sm font-medium text-white transition-[filter] hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
            disabled={!ready || state === "submitting"}
            type="submit"
          >
            <Send className="size-4" aria-hidden="true" />
            {state === "submitting" ? "正在发送…" : "发送 Magic Link"}
          </button>
        </form>

        {state === "sent" ? (
          <p
            className="mt-5 rounded-lg border border-(--success)/20 bg-(--success-light) p-3 text-[13px] text-(--success)"
            role="status"
          >
            登录链接已发送。请打开本地邮件查看器完成登录。
          </p>
        ) : null}

        {state === "error" ? (
          <p
            className="mt-5 rounded-lg border border-(--danger)/20 bg-(--danger-light) p-3 text-[13px] text-(--danger)"
            role="alert"
          >
            登录链接无效或发送失败，请重新申请。
          </p>
        ) : null}

        <div className="mt-8 border-t border-(--line) pt-5 text-[12px] text-(--ink-600)">
          本地开发请在
          <a
            className="mx-1 font-medium text-(--forest-800) underline underline-offset-2"
            href="http://127.0.0.1:54324"
            rel="noreferrer"
            target="_blank"
          >
            本地邮件查看器
          </a>
          中打开 Magic Link。
        </div>
      </section>
    </main>
  );
}
