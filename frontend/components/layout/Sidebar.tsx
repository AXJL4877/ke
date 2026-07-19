"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModuleNav } from "./ModuleNav";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    cn(
      "rounded-md px-3 py-2 transition-colors",
      pathname === href
        ? "bg-accent font-medium text-accent-foreground"
        : "text-foreground/80 hover:bg-accent/70 hover:text-foreground"
    );

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-border/80 bg-[hsl(var(--sidebar)/0.85)] backdrop-blur-md transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center border-b border-border/70 px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            KE
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">KE Studio</div>
            </div>
          )}
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-2 text-sm">
        <Link href="/" className={linkClass("/")}>
          {collapsed ? "⌂" : "工作台"}
        </Link>
        <Link href="/tasks" className={linkClass("/tasks")}>
          {collapsed ? "☰" : "任务"}
        </Link>
        <Link href="/assets" className={linkClass("/assets")}>
          {collapsed ? "◇" : "资产"}
        </Link>
      </nav>
      {!collapsed && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border/70 p-2">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            模块
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ModuleNav />
          </div>
        </div>
      )}
    </aside>
  );
}
