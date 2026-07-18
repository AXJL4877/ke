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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            工作台
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            选择模块，确认功能是否正常可用。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
          className="text-muted-foreground"
        >
          {reload.isPending ? "刷新中…" : "刷新"}
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">加载中…</p>
      )}
      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          无法连接服务，请确认已启动后重试。
          {(error as Error).message ? (
            <span className="mt-1 block text-xs opacity-80">
              {(error as Error).message}
            </span>
          ) : null}
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
              <div className="font-medium tracking-tight group-hover:text-primary">
                {m.name}
              </div>
              {m.description && m.description.length <= 48 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {m.description}
                </p>
              ) : null}
              <div className="mt-4 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                打开 →
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!isLoading && !isError && (modules?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          暂无可用模块。接入模块后点「刷新」。
        </div>
      )}
    </div>
  );
}
