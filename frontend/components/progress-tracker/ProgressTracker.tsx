"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/stage-error";
import {
  isBusinessStage,
  PROGRESS_PRESETS,
  resolveProgressPipeline,
  stageDisplayLabel,
} from "@/lib/progress-stages";

type StatusMeta = {
  pct: number;
  label: string;
  indicator: string;
  dot: string;
  text: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  pending: {
    pct: 8,
    label: "排队中",
    indicator: "bg-muted-foreground/60",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
  processing: {
    pct: 55,
    label: "处理中",
    indicator: "bg-sky-500",
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

const SHELL_PIPELINE = ["validate", "load", "run", "persist"] as const;

function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function ProgressTracker({
  status,
  failedStage,
  progress,
  progressMessage,
  progressStage,
  progressPipeline,
  progressPreset,
}: {
  status: string;
  failedStage?: string | null;
  progress?: number | null;
  progressMessage?: string | null;
  progressStage?: string | null;
  /** From module.json progress_pipeline */
  progressPipeline?: string[] | null;
  progressPreset?: string | null;
}) {
  const meta = STATUS_META[status] ?? FALLBACK;
  const hasLive = typeof progress === "number" && Number.isFinite(progress);
  const pct = hasLive ? clampPct(progress) : meta.pct;

  const declared =
    progressPipeline && progressPipeline.length > 0
      ? progressPipeline
      : progressPreset && PROGRESS_PRESETS[progressPreset]
        ? PROGRESS_PRESETS[progressPreset]
        : null;

  const businessPipeline = resolveProgressPipeline(declared, progressStage);
  const useBusiness = Boolean(
    businessPipeline &&
      businessPipeline.length > 0 &&
      (status === "processing" ||
        status === "done" ||
        (status === "failed" && isBusinessStage(progressStage)))
  );

  const active = useBusiness
    ? progressStage && businessPipeline!.includes(progressStage)
      ? progressStage
      : status === "done"
        ? businessPipeline![businessPipeline!.length - 1]
        : progressStage
    : status === "failed"
      ? failedStage || progressStage
      : status === "done"
        ? "persist"
        : status === "pending"
          ? "validate"
          : progressStage &&
              (SHELL_PIPELINE as readonly string[]).includes(progressStage)
            ? progressStage
            : progressStage || "run";

  const detail =
    (progressMessage && progressMessage.trim()) ||
    (status === "processing" ? stageDisplayLabel(progressStage) || null : null);

  const showShellFallback =
    !useBusiness &&
    (status === "failed" || status === "processing" || status === "done");

  const indicator =
    status === "processing" && !hasLive
      ? "progress-indeterminate"
      : meta.indicator;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-1.5 font-medium",
            meta.text
          )}
        >
          <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
          <span className="shrink-0">{meta.label}</span>
          {detail && status !== "done" ? (
            <span className="truncate rounded bg-sky-500/10 px-1.5 py-0.5 font-normal text-sky-800">
              {detail}
            </span>
          ) : null}
          {status === "failed" && failedStage ? (
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-normal">
              节点 · {STAGE_LABELS[failedStage] || failedStage}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
      <Progress value={pct} indicatorClassName={indicator} />

      {useBusiness && businessPipeline ? (
        <ol className="flex flex-wrap gap-1.5 pt-0.5">
          {businessPipeline.map((s, idx) => {
            const activeIdx = active
              ? businessPipeline.indexOf(active)
              : -1;
            const failed =
              status === "failed" &&
              (progressStage === s || failedStage === s);
            const activeHere =
              status === "processing" && active === s && !failed;
            const done =
              status === "done" ||
              (activeIdx >= 0 && idx < activeIdx) ||
              (status === "failed" &&
                activeIdx >= 0 &&
                idx < activeIdx);
            return (
              <li
                key={s}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors",
                  failed &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  activeHere &&
                    "border-sky-500/50 bg-sky-500/15 text-sky-900 ring-1 ring-sky-500/30",
                  done &&
                    !failed &&
                    !activeHere &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
                  !done &&
                    !failed &&
                    !activeHere &&
                    "border-border/60 bg-muted/40 text-muted-foreground"
                )}
              >
                {stageDisplayLabel(s)}
                {activeHere ? " · 进行中" : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {showShellFallback ? (
        <ol className="flex flex-wrap gap-1.5 pt-0.5">
          {SHELL_PIPELINE.map((s) => {
            const failed = status === "failed" && failedStage === s;
            const activeHere =
              status === "processing" && active === s && !failed;
            const done =
              status === "done" ||
              (status === "failed" &&
                failedStage &&
                SHELL_PIPELINE.indexOf(s) <
                  SHELL_PIPELINE.indexOf(
                    failedStage as (typeof SHELL_PIPELINE)[number]
                  )) ||
              (status === "processing" &&
                active &&
                (SHELL_PIPELINE as readonly string[]).includes(active) &&
                SHELL_PIPELINE.indexOf(s) <
                  SHELL_PIPELINE.indexOf(
                    active as (typeof SHELL_PIPELINE)[number]
                  ));
            return (
              <li
                key={s}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors",
                  failed &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  activeHere &&
                    "border-sky-500/50 bg-sky-500/15 text-sky-900 ring-1 ring-sky-500/30",
                  done &&
                    !failed &&
                    !activeHere &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
                  !done &&
                    !failed &&
                    !activeHere &&
                    "border-border/60 bg-muted/40 text-muted-foreground"
                )}
              >
                {STAGE_LABELS[s] || s}
                {activeHere ? " · 进行中" : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
