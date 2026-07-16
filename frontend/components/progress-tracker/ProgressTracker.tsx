"use client";

import { Progress } from "@/components/ui/progress";

const STATUS_PCT: Record<string, number> = {
  pending: 10,
  processing: 55,
  done: 100,
  failed: 100,
};

export function ProgressTracker({ status }: { status: string }) {
  const value = STATUS_PCT[status] ?? 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="uppercase tracking-wide text-muted-foreground">
          {status}
        </span>
        <span>{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}
