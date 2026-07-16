"use client";

import Link from "next/link";
import { useModules } from "@/hooks/useModules";

/** 根据 _registry / API 动态生成的模块导航 */
export function ModuleNav() {
  const { data: modules, isLoading } = useModules();

  if (isLoading) {
    return <p className="px-3 text-xs text-muted-foreground">加载中…</p>;
  }

  if (!modules?.length) {
    return (
      <p className="px-3 text-xs text-muted-foreground">暂无模块</p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {modules.map((m) => (
        <li key={m.id}>
          <Link
            href={`/tasks?module=${encodeURIComponent(m.id)}`}
            className="block rounded-md px-3 py-1.5 hover:bg-accent"
            title={m.description}
          >
            {m.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
