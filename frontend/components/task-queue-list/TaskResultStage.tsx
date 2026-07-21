"use client";

import { Button } from "@/components/ui/button";
import { DefaultResult } from "@/components/dynamic-form/DefaultResult";
import { loadModuleUI, type ModuleUI } from "@/modules/_ui-registry";
import { apiClient } from "@/lib/api-client";
import { readShellMeta } from "@/lib/anti-mock";
import { parseStageError } from "@/lib/stage-error";
import type { ModuleManifest } from "@/types/module";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { QueueTask } from "./TaskQueueStrip";

export function TaskResultStage({
  task,
  manifest,
}: {
  task: QueueTask | null;
  manifest?: ModuleManifest;
}) {
  const [ui, setUi] = useState<ModuleUI | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const parsed = parseStageError(task?.error_message ?? null);

  useEffect(() => {
    let cancelled = false;
    setUi(null);
    if (!task?.module_id) return;
    void loadModuleUI(task.module_id).then((m) => {
      if (!cancelled) setUi(m);
    });
    return () => {
      cancelled = true;
    };
  }, [task?.module_id, task?.id]);

  const remove = useMutation({
    mutationFn: () =>
      apiClient.delete(`/api/tasks/${task!.id}`, { auth: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  if (!task) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 text-center">
        <p className="text-base font-medium text-foreground/80">输出</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          点击右上角「输入」填写参数并运行，结果会显示在这里。
        </p>
      </div>
    );
  }

  const Result = ui?.Result;
  const showResult = task.status === "done" && task.result && manifest;
  const shellMeta = readShellMeta(task.result);
  const showMockBanner = Boolean(shellMeta?.mock);
  const showFastBanner = Boolean(shellMeta?.fast_completion) && !showMockBanner;
  const assetLinks = Array.isArray(task.result?._assets)
    ? (task.result!._assets as { id?: string; title?: string }[])
    : [];
  const title = manifest?.name || task.module_id;
  const running =
    task.status === "pending" || task.status === "processing";

  return (
    <div className="page-fade flex min-h-[24rem] flex-col rounded-xl border border-border/80 bg-card/90 shadow-[0_8px_28px_-18px_hsl(215_30%_20%/0.2)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">
            {title}
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              #{task.id.slice(0, 8)}
            </span>
          </h2>
        </div>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              确认删除
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setConfirming(false)}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label="删除任务"
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
      </div>

      <div className="flex flex-1 flex-col px-5 py-5">
        {running ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              处理中，完成后显示在此
            </p>
          </div>
        ) : null}

        {!running && showMockBanner ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-950">
            <div className="font-semibold">结果异常</div>
            <p className="mt-1 text-xs leading-relaxed">
              看起来不是真实运行结果，请重新运行确认。
            </p>
          </div>
        ) : null}
        {!running && showFastBanner ? (
          <div className="mb-4 rounded-md border border-orange-500/35 bg-orange-500/10 px-3 py-2 text-sm text-orange-950">
            <div className="font-semibold">完成过快</div>
            <p className="mt-1 text-xs leading-relaxed">
              可能未真正跑通，请核对结果内容是否完整。
            </p>
          </div>
        ) : null}

        {!running && task.error_message ? (
          <div className="mb-4 space-y-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
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
                onClick={async () => {
                  if (!parsed.raw) return;
                  await navigator.clipboard.writeText(parsed.raw);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
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
          <div className="min-w-0">
            <Result result={task.result!} manifest={manifest!} />
          </div>
        ) : null}
        {showResult && !Result ? (
          <DefaultResult result={task.result!} manifest={manifest!} />
        ) : null}

        {showResult && assetLinks.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
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

        {!running &&
        !showResult &&
        !task.error_message &&
        task.status === "done" ? (
          <p className="text-sm text-muted-foreground">暂无可展示的成果内容。</p>
        ) : null}
      </div>
    </div>
  );
}
