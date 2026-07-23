"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { parseStageError, STAGE_LABELS } from "@/lib/stage-error";
import { cn } from "@/lib/utils";
import type { ModuleManifest } from "@/types/module";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Loader2, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";

export type QueueTask = {
  id: string;
  module_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const STATUS_TAG: Record<
  string,
  { label: string; className: string; pct: number; bar: string }
> = {
  pending: {
    label: "排队",
    className: "bg-secondary text-secondary-foreground",
    pct: 12,
    bar: "bg-muted-foreground/50",
  },
  processing: {
    label: "进行中",
    className: "bg-sky-500/15 text-sky-800",
    pct: 55,
    bar: "progress-indeterminate",
  },
  done: {
    label: "完成",
    className: "bg-emerald-500/15 text-emerald-800",
    pct: 100,
    bar: "bg-emerald-500",
  },
  failed: {
    label: "失败",
    className: "bg-destructive/15 text-destructive",
    pct: 100,
    bar: "bg-destructive",
  },
};

function statusMeta(status: string) {
  return (
    STATUS_TAG[status] ?? {
      label: status,
      className: "bg-muted text-muted-foreground",
      pct: 0,
      bar: "bg-muted-foreground/40",
    }
  );
}

export function TaskQueueStrip({
  tasks,
  modules,
  selectedId,
  onSelect,
  moduleId,
}: {
  tasks: QueueTask[];
  modules?: ModuleManifest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  moduleId?: string;
}) {
  const queryClient = useQueryClient();
  const finished = tasks.filter(
    (t) => t.status === "done" || t.status === "failed"
  );

  const clearFinished = useMutation({
    mutationFn: () => {
      const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
      return apiClient.delete(`/api/tasks${q}`, { auth: false });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
        暂无任务
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">队列</span>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 tabular-nums">
            {tasks.length}
          </span>
        </div>
        {finished.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => clearFinished.mutate()}
            disabled={clearFinished.isPending}
            data-testid="ke-task-clear-finished"
          >
            {clearFinished.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" />
            )}
            清空已结束
          </Button>
        ) : null}
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tasks.map((task, i) => {
          const meta = statusMeta(task.status);
          const name =
            modules?.find((m) => m.id === task.module_id)?.name ||
            task.module_id;
          const parsed = parseStageError(task.error_message);
          const selected = selectedId === task.id;
          const stageTag =
            task.status === "failed" && parsed.stage
              ? STAGE_LABELS[parsed.stage] || parsed.stage
              : task.status === "processing"
                ? "执行"
                : null;

          return (
            <li
              key={task.id}
              className="task-item-enter shrink-0"
              style={{ "--stagger": String(i) } as CSSProperties}
            >
              <button
                type="button"
                data-testid={`ke-task-card-${task.id}`}
                onClick={() => onSelect(task.id)}
                className={cn(
                  "w-[11.5rem] rounded-lg border px-2.5 py-2 text-left transition-all",
                  selected
                    ? "border-primary/50 bg-accent shadow-sm ring-1 ring-primary/25"
                    : "border-border/80 bg-card/90 hover:border-primary/30 hover:bg-accent/50"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-medium">{name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      meta.className
                    )}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Progress
                    value={meta.pct}
                    className="h-1.5"
                    indicatorClassName={meta.bar}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{task.id.slice(0, 6)}
                  </span>
                  {stageTag ? (
                    <span className="rounded border border-border/70 px-1 py-px text-[10px] text-muted-foreground">
                      {stageTag}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
