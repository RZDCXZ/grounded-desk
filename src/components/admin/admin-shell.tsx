"use client";

import {
  Bot,
  CircleHelp,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/auth/actions";

const navigation = [
  { label: "概览", href: "/admin", icon: LayoutDashboard },
  { label: "知识来源", href: "/admin/knowledge-sources", icon: Database },
  { label: "助手", href: "/admin/assistant", icon: Bot },
  { label: "会话", href: "/admin/conversations", icon: MessageSquareText },
  {
    label: "待解决问题",
    href: "/admin/unresolved-questions",
    icon: CircleHelp,
  },
] as const;

type AdminShellProps = {
  children: React.ReactNode;
  organizationName: string;
  administratorEmail: string;
};

export function AdminShell({
  children,
  organizationName,
  administratorEmail,
}: AdminShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:pl-58">
      <button
        aria-expanded={open}
        aria-label={open ? "关闭导航" : "打开导航"}
        className="fixed right-4 top-4 z-50 grid size-10 place-items-center rounded-lg border border-(--line) bg-white text-(--forest-950) lg:hidden"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {open ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
      </button>

      {open ? (
        <button
          aria-label="关闭导航"
          className="fixed inset-0 z-30 bg-(--forest-950)/20 lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-58 flex-col border-r border-(--line) bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-(--line) px-6">
          <span className="grid size-8 place-items-center rounded-lg bg-(--forest-950) text-white">
            <span className="size-2.5 border border-white" aria-hidden="true" />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-(--forest-950)">
            GroundedDesk
          </span>
        </div>

        <nav aria-label="后台导航" className="flex-1 px-3 py-5">
          <ul className="space-y-1">
            {navigation.map(({ label, href, icon: Icon }) => {
              const isCurrent =
                href === "/admin"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);

              return (
                <li key={href}>
                  <Link
                    aria-current={isCurrent ? "page" : undefined}
                    className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                      isCurrent
                        ? "bg-(--forest-100) text-(--forest-950) before:absolute before:-left-3 before:h-5 before:w-0.5 before:bg-(--forest-800)"
                        : "text-(--ink-600) hover:bg-(--paper) hover:text-(--ink-900)"
                    }`}
                    href={href}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="size-4.5" strokeWidth={1.7} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-(--line) p-4">
          <p className="truncate text-[13px] font-medium">{organizationName}</p>
          <p className="mt-0.5 truncate text-[11px] text-(--ink-400)">
            {administratorEmail}
          </p>
          <form action={signOut} className="mt-3">
            <button
              className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-(--ink-600) hover:bg-(--paper) hover:text-(--ink-900)"
              type="submit"
            >
              <LogOut className="size-4" strokeWidth={1.7} />
              安全退出
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
