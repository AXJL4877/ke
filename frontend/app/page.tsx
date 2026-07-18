"use client";

import Link from "next/link";
import { useModules } from "@/hooks/useModules";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { data: modules, isLoading, error, isError } = useModules();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          KE Studio · 模块底座
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          工作台
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          从已注册模块发起任务。新模块放入{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">modules/</code>{" "}
          后自动出现，表单与结果走统一壳层 UI。
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">加载模块清单…</p>
      )}
      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          无法加载模块列表：{(error as Error).message}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(modules ?? []).map((m, i) => (
          <li
            key={m.id}
            className="module-card-enter"
            style={{ "--stagger": String(i) } as React.CSSProperties}
          >
            <Link
              href={`/tasks?module=${encodeURIComponent(m.id)}`}
              className={cn(
                "shell-card group block rounded-xl p-5 transition duration-200",
                "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium tracking-tight group-hover:text-primary">
                  {m.name}
                </div>
                {m.category ? (
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                    {m.category}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {m.id}
              </div>
              {m.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                  {m.description}
                </p>
              ) : null}
              <div className="mt-4 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                打开任务 →
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!isLoading && !isError && (modules?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          暂无模块。请在{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            backend/modules/
          </code>{" "}
          按 MODULE_SPEC.md 添加 module.json + handler.py。
        </div>
      )}
    </div>
  );
}
