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
