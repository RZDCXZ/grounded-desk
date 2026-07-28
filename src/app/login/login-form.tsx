"use client";

import { Mail, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { BrandMark } from "@/components/admin/brand-mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
        <BrandMark className="mb-8" size="large" />

        <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-(--forest-950)">
          进入 GroundedDesk
        </h1>
        <p className="mt-2 text-sm text-(--ink-600)">
          使用预配置管理员邮箱获取一次性登录链接。
        </p>

        <form className="mt-8" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field controlId="administrator-email">
              <FieldLabel>管理员邮箱</FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
                />
                <Input
                  className="h-11 pl-10"
                  name="email"
                  readOnly
                  type="email"
                  value={adminEmail}
                />
              </div>
            </Field>

            <Button
              className="w-full"
              disabled={!ready || state === "submitting"}
              size="large"
              type="submit"
            >
              <Send aria-hidden="true" data-icon="inline-start" />
              {state === "submitting" ? "正在发送…" : "发送 Magic Link"}
            </Button>
          </FieldGroup>
        </form>

        {state === "sent" ? (
          <Alert className="mt-5" role="status" variant="success">
            <AlertDescription>
              登录链接已发送。请打开本地邮件查看器完成登录。
            </AlertDescription>
          </Alert>
        ) : null}

        {state === "error" ? (
          <Alert className="mt-5" role="alert" variant="danger">
            <AlertDescription>
              登录链接无效或发送失败，请重新申请。
            </AlertDescription>
          </Alert>
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
