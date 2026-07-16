"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { TaskCard } from "./TaskCard";

type Task = {
  id: string;
  module_id: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export function TaskQueueList({ moduleId }: { moduleId?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", moduleId],
    queryFn: () => {
      const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
      return apiClient.get<Task[]>(`/api/tasks${q}`, { auth: false });
    },
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载任务…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }

  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">暂无任务</p>;
  }

  return (
    <ul className="space-y-3">
      {data.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </ul>
  );
}
