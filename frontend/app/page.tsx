"use client";

import Link from "next/link";
import { useModules } from "@/hooks/useModules";

export default function HomePage() {
  const { data: modules, isLoading, error } = useModules();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从已注册模块发起任务。模块由 module.json 自动发现，无需改壳代码。
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载模块…</p>}
      {error && (
        <p className="text-sm text-destructive">
          无法加载模块列表：{(error as Error).message}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(modules ?? []).map((m) => (
          <li key={m.id}>
            <Link
              href={`/tasks?module=${encodeURIComponent(m.id)}`}
              className="block rounded-lg border bg-card p-4 transition hover:bg-accent"
            >
              <div className="font-medium">{m.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.id}</div>
              {m.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {m.description}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {!isLoading && !error && (modules?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">
          暂无模块。请在 modules/ 下按 MODULE_SPEC.md 添加 module.json。
        </p>
      )}
    </div>
  );
}
