"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useModules } from "@/hooks/useModules";
import { AGENT_TESTID } from "@/lib/agent-macros";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

function ModuleNavInner() {
  const { data: modules, isLoading } = useModules();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("module");

  if (isLoading) {
    return <p className="px-3 text-xs text-muted-foreground">加载中…</p>;
  }

  if (!modules?.length) {
    return <p className="px-3 text-xs text-muted-foreground">暂无模块</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5" aria-label="模块列表">
      {modules.map((m) => {
        const href = `/tasks?module=${encodeURIComponent(m.id)}`;
        const active = pathname.startsWith("/tasks") && activeId === m.id;
        return (
          <li key={m.id}>
            <Link
              href={href}
              data-testid={AGENT_TESTID.moduleNav(m.id)}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-accent/80 hover:text-foreground"
              )}
              title={m.name}
            >
              {m.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 根据 _registry / API 动态生成的模块导航 */
export function ModuleNav() {
  return (
    <Suspense fallback={<p className="px-3 text-xs text-muted-foreground">加载中…</p>}>
      <ModuleNavInner />
    </Suspense>
  );
}
