"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./TaskCard";
import type { ModuleManifest } from "@/types/module";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  module_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const ACTIVE = new Set(["pending", "processing"]);

export function TaskQueueList({
  moduleId,
  modules,
}: {
  moduleId?: string;
  modules?: ModuleManifest[];
}) {
  const queryClient = useQueryClient();
  const [showFinished, setShowFinished] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", moduleId],
    queryFn: () => {
      const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
      return apiClient.get<Task[]>(`/api/tasks${q}`, { auth: false });
    },
    refetchInterval: (query) => {
      const list = query.state.data ?? [];
      const hasActive = list.some((t) => ACTIVE.has(t.status));
      return hasActive ? 1500 : 8000;
    },
  });

  const clearFinished = useMutation({
    mutationFn: () => {
      const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
      return apiClient.delete(`/api/tasks${q}`, { auth: false });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">加载任务…</p>;
  if (error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }

  const tasks = data ?? [];
  const active = tasks.filter((t) => ACTIVE.has(t.status));
  const finished = tasks.filter((t) => !ACTIVE.has(t.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          任务队列
          <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-secondary-foreground">
            {tasks.length}
          </span>
        </h3>
        {finished.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => clearFinished.mutate()}
            disabled={clearFinished.isPending}
          >
            {clearFinished.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" />
            )}
            清空已完成 ({finished.length})
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 py-10 text-center text-sm text-muted-foreground">
          暂无任务，提交表单后将在此显示。
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="space-y-3">
              {active.map((t, i) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  staggerIndex={i}
                  manifest={modules?.find((m) => m.id === t.module_id)}
                />
              ))}
            </ul>
          )}

          {finished.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowFinished((v) => !v)}
                className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showFinished ? "rotate-0" : "-rotate-90"
                  )}
                />
                已完成 / 失败 ({finished.length})
              </button>
              {showFinished && (
                <ul className="space-y-3">
                  {finished.map((t, i) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      staggerIndex={i}
                      manifest={modules?.find((m) => m.id === t.module_id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
