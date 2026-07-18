"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/stage-error";

type StatusMeta = {
  pct: number;
  label: string;
  indicator: string;
  dot: string;
  text: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  pending: {
    pct: 10,
    label: "排队中",
    indicator: "bg-muted-foreground/60",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
  processing: {
    pct: 60,
    label: "处理中",
    indicator: "progress-indeterminate",
    dot: "bg-sky-500 animate-pulse",
    text: "text-sky-700",
  },
  done: {
    pct: 100,
    label: "已完成",
    indicator: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  failed: {
    pct: 100,
    label: "失败",
    indicator: "bg-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
  },
};

const FALLBACK: StatusMeta = {
  pct: 0,
  label: "未知",
  indicator: "bg-muted-foreground/40",
  dot: "bg-muted-foreground/40",
  text: "text-muted-foreground",
};

const PIPELINE = ["validate", "load", "run", "persist"] as const;

export function ProgressTracker({
  status,
  failedStage,
}: {
  status: string;
  /** When failed, highlight which stage broke */
  failedStage?: string | null;
}) {
  const meta = STATUS_META[status] ?? FALLBACK;
  const showPipeline = status === "failed" || status === "processing" || status === "done";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={cn("flex items-center gap-1.5 font-medium", meta.text)}>
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          {meta.label}
          {status === "failed" && failedStage ? (
            <span className="ml-1 rounded bg-destructive/15 px-1.5 py-0.5 font-normal">
              节点 · {STAGE_LABELS[failedStage] || failedStage}
            </span>
          ) : null}
        </span>
        <span className="tabular-nums text-muted-foreground">{meta.pct}%</span>
      </div>
      <Progress value={meta.pct} indicatorClassName={meta.indicator} />
      {showPipeline ? (
        <ol className="flex flex-wrap gap-1.5 pt-0.5">
          {PIPELINE.map((s) => {
            const failed = status === "failed" && failedStage === s;
            const done =
              status === "done" ||
              (status === "failed" &&
                failedStage &&
                PIPELINE.indexOf(s) < PIPELINE.indexOf(failedStage as (typeof PIPELINE)[number]));
            return (
              <li
                key={s}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                  failed && "border-destructive/40 bg-destructive/10 text-destructive",
                  done && !failed && "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
                  !done && !failed && "border-border/60 bg-muted/40 text-muted-foreground"
                )}
              >
                {STAGE_LABELS[s] || s}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
