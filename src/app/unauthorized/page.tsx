import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <section className="max-w-md rounded-xl border border-(--line) bg-white p-8">
        <p className="mono text-xs font-semibold text-(--warning)">访问受限</p>
        <h1 className="mt-3 text-2xl font-bold text-(--forest-950)">
          此身份不属于演示组织
        </h1>
        <p className="mt-3 text-sm text-(--ink-600)">
          Supabase 认证成功不代表拥有后台权限。只有组织管理员成员可以读取组织数据。
        </p>
        <Button asChild className="mt-6" variant="secondary">
          <Link href="/login">返回登录</Link>
        </Button>
      </section>
    </main>
  );
}
