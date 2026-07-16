"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressTracker } from "@/components/progress-tracker/ProgressTracker";
import { DefaultResult } from "@/components/dynamic-form/DefaultResult";
import { loadModuleUI, type ModuleUI } from "@/modules/_ui-registry";
import type { ModuleManifest } from "@/types/module";
import { useEffect, useState } from "react";

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
}: {
  task: Task;
  manifest?: ModuleManifest;
}) {
  const [ui, setUi] = useState<ModuleUI | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadModuleUI(task.module_id).then((m) => {
      if (!cancelled) setUi(m);
    });
    return () => {
      cancelled = true;
    };
  }, [task.module_id]);

  const Result = ui?.Result;
  const showResult = task.status === "done" && task.result && manifest;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {manifest?.name || task.module_id}{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {task.id.slice(0, 8)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressTracker status={task.status} />
        {task.error_message && (
          <p className="text-sm text-destructive">{task.error_message}</p>
        )}
        {showResult && Result ? (
          <Result result={task.result!} manifest={manifest!} />
        ) : null}
        {showResult && !Result ? (
          <DefaultResult result={task.result!} manifest={manifest!} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {new Date(task.created_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
