"use client";

import Link from "next/link";
import { useModules, useReloadModules } from "@/hooks/useModules";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { data: modules, isLoading, error, isError } = useModules();
  const reload = useReloadModules();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            KE Studio · 开发基座
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            工作台
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            按需接入{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              backend/modules/
            </code>{" "}
            中的模块。壳默认禁止演示/mock，并以 capabilities 强制登记必要能力。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
        >
          {reload.isPending ? "刷新中…" : "刷新模块"}
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">加载模块清单…</p>
      )}
      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          无法加载模块列表：{(error as Error).message}
          <span className="mt-1 block text-xs">
            确认后端 http://127.0.0.1:8000 已启动，或点击「刷新模块」。
          </span>
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
                {m.capabilities?.length
                  ? ` · ${m.capabilities.filter((c) => c.must_keep).length} must_keep`
                  : " · 缺 capabilities"}
              </div>
              {m.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                  {m.description}
                </p>
              ) : null}
              {(m.shell?.warnings?.length ?? 0) > 0 ? (
                <p className="mt-2 text-[11px] text-amber-700 line-clamp-2">
                  {m.shell!.warnings![0]}
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
          暂无业务模块（示例 echo 默认隐藏）。请在{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            backend/modules/
          </code>{" "}
          添加带 capabilities[] 的 module.json + handler.py，再点「刷新模块」。
        </div>
      )}
    </div>
  );
}
