"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressTracker } from "@/components/progress-tracker/ProgressTracker";
import { DefaultResult } from "@/components/dynamic-form/DefaultResult";
import { loadModuleUI, type ModuleUI } from "@/modules/_ui-registry";
import { apiClient } from "@/lib/api-client";
import { readShellMeta } from "@/lib/anti-mock";
import { parseStageError } from "@/lib/stage-error";
import { cn } from "@/lib/utils";
import type { ModuleManifest } from "@/types/module";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

type Task = {
  id: string;
  module_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export function TaskCard({
  task,
  manifest,
  staggerIndex = 0,
}: {
  task: Task;
  manifest?: ModuleManifest;
  staggerIndex?: number;
}) {
  const [ui, setUi] = useState<ModuleUI | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const parsed = parseStageError(task.error_message);

  useEffect(() => {
    let cancelled = false;
    void loadModuleUI(task.module_id).then((m) => {
      if (!cancelled) setUi(m);
    });
    return () => {
      cancelled = true;
    };
  }, [task.module_id]);

  const remove = useMutation({
    mutationFn: () =>
      apiClient.delete(`/api/tasks/${task.id}`, { auth: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => setLeaving(false),
  });

  function handleDelete() {
    setConfirming(false);
    setLeaving(true);
    window.setTimeout(() => remove.mutate(), 280);
  }

  async function copyError() {
    if (!parsed.raw) return;
    await navigator.clipboard.writeText(parsed.raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const Result = ui?.Result;
  const showResult = task.status === "done" && task.result && manifest;
  const shellMeta = readShellMeta(task.result);
  const showMockBanner = Boolean(shellMeta?.mock);
  const showFastBanner = Boolean(shellMeta?.fast_completion) && !showMockBanner;
  const assetLinks = Array.isArray(task.result?._assets)
    ? (task.result!._assets as { id?: string; title?: string; kind?: string }[])
    : [];

  return (
    <li
      className={cn(leaving ? "task-item-leave" : "task-item-enter")}
        style={
          leaving
            ? undefined
            : ({ "--stagger": String(staggerIndex) } as CSSProperties)
        }
    >
      <Card className="shell-card transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">
            {manifest?.name || task.module_id}{" "}
            <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
              #{task.id.slice(0, 8)}
            </span>
          </CardTitle>
          {confirming ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleDelete}
                disabled={remove.isPending}
              >
                确认删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setConfirming(false)}
              >
                取消
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="删除任务"
              title="删除任务"
              onClick={() => setConfirming(true)}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressTracker
            status={task.status}
            failedStage={task.status === "failed" ? parsed.stage : null}
          />
          {showMockBanner ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-950">
              <div className="font-semibold">结果异常</div>
              <p className="mt-1 text-xs leading-relaxed">
                看起来不是真实运行结果，请重新运行确认。
              </p>
            </div>
          ) : null}
          {showFastBanner ? (
            <div className="rounded-md border border-orange-500/35 bg-orange-500/10 px-3 py-2 text-sm text-orange-950">
              <div className="font-semibold">完成过快</div>
              <p className="mt-1 text-xs leading-relaxed">
                可能未真正跑通，请核对结果内容是否完整。
              </p>
            </div>
          ) : null}
          {task.error_message ? (
            <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-destructive">
                  {parsed.stageLabel
                    ? `失败节点：${parsed.stageLabel}`
                    : "任务失败"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void copyError()}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-destructive/95">
                {parsed.message || parsed.raw}
              </p>
            </div>
          ) : null}
          {showResult && Result ? (
            <Result result={task.result!} manifest={manifest!} />
          ) : null}
          {showResult && !Result ? (
            <DefaultResult result={task.result!} manifest={manifest!} />
          ) : null}
          {assetLinks.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              已存入资产
              {assetLinks[0]?.id ? (
                <>
                  {" · "}
                  <Link
                    href="/assets"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {assetLinks[0].title || "查看"}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {new Date(task.created_at).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
