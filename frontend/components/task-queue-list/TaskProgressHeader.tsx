"use client";

import { Progress } from "@/components/ui/progress";
import { ProgressTracker } from "@/components/progress-tracker/ProgressTracker";
import { TaskQueueStrip, type QueueTask } from "@/components/task-queue-list/TaskQueueStrip";
import { parseStageError } from "@/lib/stage-error";
import { cn } from "@/lib/utils";
import type { ModuleManifest } from "@/types/module";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const BAR: Record<string, { pct: number; label: string; text: string; bar: string; dot: string }> = {
  pending: {
    pct: 10,
    label: "排队中",
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/60",
    dot: "bg-muted-foreground/60",
  },
  processing: {
    pct: 60,
    label: "处理中",
    text: "text-sky-700",
    bar: "progress-indeterminate",
    dot: "bg-sky-500 animate-pulse",
  },
  done: {
    pct: 100,
    label: "已完成",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
  },
  failed: {
    pct: 100,
    label: "失败",
    text: "text-destructive",
    bar: "bg-destructive",
    dot: "bg-destructive",
  },
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
    ? BAR[task.status] ?? {
        pct: 0,
        label: task.status,
        text: "text-muted-foreground",
        bar: "bg-muted-foreground/40",
        dot: "bg-muted-foreground/40",
      }
    : null;
  const title =
    (task && modules?.find((m) => m.id === task.module_id)?.name) ||
    task?.module_id ||
    null;
  const parsed = parseStageError(task?.error_message);

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[0_6px_20px_-16px_hsl(215_30%_20%/0.18)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {meta ? (
                <>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                  <span className={cn("text-sm font-medium", meta.text)}>
                    {meta.label}
                  </span>
                  {title ? (
                    <span className="truncate text-sm text-foreground/80">
                      {title}
                    </span>
                  ) : null}
                  {task ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      #{task.id.slice(0, 8)}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {tasksLoading ? "加载任务进度…" : "暂无进行中的任务"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {meta ? (
                <span className="tabular-nums text-xs text-muted-foreground">
                  {meta.pct}%
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </div>
          </div>
          <Progress
            value={meta?.pct ?? 0}
            className="h-1.5"
            indicatorClassName={meta?.bar ?? "bg-muted-foreground/30"}
          />
        </div>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t border-border/70 px-4 py-4">
            {task ? (
              <ProgressTracker
                status={task.status}
                failedStage={
                  task.status === "failed" ? parsed.stage : null
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                提交任务后，这里显示阶段与队列详情。
              </p>
            )}

            {task?.error_message ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive/90">
                <span className="font-semibold">
                  {parsed.stageLabel
                    ? `失败节点 · ${parsed.stageLabel}`
                    : "错误"}
                </span>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                  {parsed.message || parsed.raw}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                任务队列
              </p>
              {tasksLoading ? (
                <p className="text-sm text-muted-foreground">加载队列…</p>
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
