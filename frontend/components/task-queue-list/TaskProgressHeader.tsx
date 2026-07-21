"use client";

import { Progress } from "@/components/ui/progress";
import { ProgressTracker } from "@/components/progress-tracker/ProgressTracker";
import { TaskQueueStrip, type QueueTask } from "@/components/task-queue-list/TaskQueueStrip";
import { parseStageError } from "@/lib/stage-error";
import { cn } from "@/lib/utils";
import type { ModuleManifest } from "@/types/module";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const BAR: Record<string, { pct: number; bar: string }> = {
  pending: { pct: 10, bar: "bg-muted-foreground/55" },
  processing: { pct: 60, bar: "progress-indeterminate" },
  done: { pct: 100, bar: "bg-emerald-500" },
  failed: { pct: 100, bar: "bg-destructive" },
};

export function TaskProgressHeader({
  task,
  tasks,
  modules,
  selectedId,
  onSelect,
  moduleId,
  tasksLoading,
}: {
  task: QueueTask | null;
  tasks: QueueTask[];
  modules?: ModuleManifest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  moduleId?: string;
  tasksLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = task
    ? BAR[task.status] ?? { pct: 0, bar: "bg-muted-foreground/30" }
    : { pct: 0, bar: "bg-muted-foreground/25" };
  const title =
    (task && modules?.find((m) => m.id === task.module_id)?.name) ||
    task?.module_id ||
    null;
  const parsed = parseStageError(task?.error_message);

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-card/80">
      <button
        type="button"
        className="group flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "收起进度详情" : "展开进度详情"}
      >
        <Progress
          value={meta.pct}
          className="h-1 flex-1"
          indicatorClassName={meta.bar}
        />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 border-t border-border/60 px-3 py-3">
            {task ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {title ? (
                    <span className="font-medium text-foreground/80">{title}</span>
                  ) : null}
                  <span className="font-mono">#{task.id.slice(0, 8)}</span>
                </div>
                <ProgressTracker
                  status={task.status}
                  failedStage={
                    task.status === "failed" ? parsed.stage : null
                  }
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {tasksLoading ? "加载中…" : "暂无任务进度"}
              </p>
            )}

            {task?.error_message ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive/90">
                <span className="font-semibold">
                  {parsed.stageLabel
                    ? `失败 · ${parsed.stageLabel}`
                    : "错误"}
                </span>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                  {parsed.message || parsed.raw}
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                队列
              </p>
              {tasksLoading ? (
                <p className="text-xs text-muted-foreground">加载队列…</p>
              ) : (
                <TaskQueueStrip
                  tasks={tasks}
                  modules={modules}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  moduleId={moduleId}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
