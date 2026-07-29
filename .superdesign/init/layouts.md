# Shared Layouts

## src/app/layout.tsx

根布局，加载全局样式并设置中文页面元数据。

```tsx
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GroundedDesk",
  description: "将可管理的知识转化为有据回答",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

## src/app/admin/layout.tsx

管理员路由布局，完成管理员校验后挂载 AdminShell。

```tsx
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdministrator } from "@/lib/auth/require-admin";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, organization } = await requireAdministrator();

  return (
    <AdminShell
      administratorEmail={user.email ?? "管理员"}
      organizationName={organization.name}
    >
      {children}
    </AdminShell>
  );
}
```

## src/components/admin/admin-shell.tsx

管理员后台固定侧栏与主内容区壳层。

```tsx
import { AdminNavigationClient } from "@/components/admin/admin-navigation-client";

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
  return (
    <div className="min-h-screen lg:pl-58">
      <AdminNavigationClient
        administratorEmail={administratorEmail}
        organizationName={organizationName}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

## src/components/admin/admin-navigation-client.tsx

桌面固定侧栏、移动顶栏、五项业务导航与组织身份区。

```tsx
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
import { BrandMark } from "@/components/admin/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

type AdminNavigationClientProps = {
  organizationName: string;
  administratorEmail: string;
};

export function AdminNavigationClient({
  organizationName,
  administratorEmail,
}: AdminNavigationClientProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-58 flex-col border-r border-line bg-card lg:flex">
        <NavigationContent
          administratorEmail={administratorEmail}
          organizationName={organizationName}
          pathname={pathname}
        />
      </aside>

      <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
        <SheetTrigger asChild>
          <Button
            aria-label="打开导航"
            className="fixed top-4 right-4 z-40 lg:hidden"
            size="icon"
            variant="secondary"
          >
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          className="w-58"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLElement>(
                '[data-slot="mobile-navigation"] a[aria-current="page"]',
              )
              ?.focus();
          }}
          showCloseButton={false}
          side="left"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>后台导航</SheetTitle>
            <SheetDescription>
              切换 GroundedDesk 管理页面或安全退出。
            </SheetDescription>
          </SheetHeader>
          <div
            className="flex min-h-0 flex-1 flex-col"
            data-slot="mobile-navigation"
          >
            <NavigationContent
              administratorEmail={administratorEmail}
              onNavigate={() => setMobileOpen(false)}
              organizationName={organizationName}
              pathname={pathname}
            />
          </div>
          <SheetClose asChild>
            <Button
              aria-label="关闭导航"
              className="absolute top-4 right-4"
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </>
  );
}

type NavigationContentProps = AdminNavigationClientProps & {
  pathname: string;
  onNavigate?: () => void;
};

function NavigationContent({
  organizationName,
  administratorEmail,
  pathname,
  onNavigate,
}: NavigationContentProps) {
  return (
    <>
      <div className="flex h-20 shrink-0 items-center border-b border-line px-6">
        <BrandMark />
      </div>

      <nav aria-label="后台导航" className="flex-1 overflow-y-auto px-3 py-5">
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
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors",
                    isCurrent
                      ? "bg-forest-100 text-forest-950 before:absolute before:-left-3 before:h-5 before:w-0.5 before:bg-forest-800"
                      : "text-ink-600 hover:bg-paper hover:text-ink-900",
                  )}
                  href={href}
                  onClick={onNavigate}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-4.5"
                    strokeWidth={1.7}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-4">
        <p className="truncate text-[13px] font-medium">{organizationName}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-600">
          {administratorEmail}
        </p>
        <form action={signOut} className="mt-3">
          <Button className="w-full justify-start" type="submit" variant="ghost">
            <LogOut
              aria-hidden="true"
              data-icon="inline-start"
              strokeWidth={1.7}
            />
            安全退出
          </Button>
        </form>
      </div>
    </>
  );
}
```

## src/components/admin/admin-page-header.tsx

管理员页面共享标题、上下文说明与右侧动作区。

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b border-line bg-card px-5 py-4 pr-18 sm:px-8 lg:pr-8",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-forest-950">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </header>
  );
}
```

## src/components/admin/brand-mark.tsx

GroundedDesk 依据节点标记与字标。

```tsx
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: "default" | "large";
};

export function BrandMark({
  className,
  size = "default",
}: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-lg bg-forest-950 text-white",
          size === "large" ? "size-10" : "size-8",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "border border-white",
            size === "large" ? "size-3" : "size-2.5",
          )}
        />
      </span>
      <span
        className={cn(
          "font-semibold tracking-[-0.02em] text-forest-950",
          size === "large" ? "text-lg" : "text-[16px]",
        )}
      >
        GroundedDesk
      </span>
    </div>
  );
}
```
