"use client";

import { TaskQueueList } from "@/components/task-queue-list/TaskQueueList";
import { DynamicForm } from "@/components/dynamic-form/DynamicForm";
import { useModules } from "@/hooks/useModules";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense } from "react";

function TasksContent() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get("module");
  const { data: modules } = useModules();
  const queryClient = useQueryClient();
  const mod = modules?.find((m) => m.id === moduleId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          提交与查看处理任务状态。
        </p>
      </div>

      {mod && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{mod.name}</h2>
          <DynamicForm
            schema={mod.input_schema}
            onSubmit={async (values) => {
              await apiClient.post("/api/tasks", {
                module_id: mod.id,
                input_params: values,
              });
              await queryClient.invalidateQueries({ queryKey: ["tasks"] });
            }}
          />
        </section>
      )}

      <TaskQueueList moduleId={moduleId ?? undefined} />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">加载中…</p>}>
      <TasksContent />
    </Suspense>
  );
}
