"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressTracker } from "@/components/progress-tracker/ProgressTracker";
import { VideoPreview } from "@/components/video-preview/VideoPreview";

type Task = {
  id: string;
  module_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export function TaskCard({ task }: { task: Task }) {
  const url =
    task.result && typeof task.result.url === "string"
      ? task.result.url
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {task.module_id}{" "}
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
        {url && <VideoPreview src={url} />}
        <p className="text-xs text-muted-foreground">
          {new Date(task.created_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
