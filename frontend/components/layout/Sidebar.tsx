"use client";

import Link from "next/link";
import { ModuleNav } from "./ModuleNav";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-muted/30 transition-all",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex h-14 items-center border-b px-4 font-semibold">
        {collapsed ? "KE" : "KE Studio"}
      </div>
      <nav className="flex flex-col gap-1 p-2 text-sm">
        <Link href="/" className="rounded-md px-3 py-2 hover:bg-accent">
          {collapsed ? "⌂" : "工作台"}
        </Link>
        <Link href="/tasks" className="rounded-md px-3 py-2 hover:bg-accent">
          {collapsed ? "☰" : "任务"}
        </Link>
      </nav>
      {!collapsed && (
        <div className="mt-2 border-t p-2">
          <div className="px-3 py-1 text-xs text-muted-foreground">模块</div>
          <ModuleNav />
        </div>
      )}
    </aside>
  );
}
