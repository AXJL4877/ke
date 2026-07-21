"use client";

import { TaskProgressHeader } from "@/components/task-queue-list/TaskProgressHeader";
import { TaskResultStage } from "@/components/task-queue-list/TaskResultStage";
import type { QueueTask } from "@/components/task-queue-list/TaskQueueStrip";
import { DynamicForm } from "@/components/dynamic-form/DynamicForm";
import { useModules, useReloadModules } from "@/hooks/useModules";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadModuleUI,
  type ModuleUI,
} from "@/modules/_ui-registry";
import { stripMockFieldsFromSchema } from "@/lib/anti-mock";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, RefreshCw } from "lucide-react";

const ACTIVE = new Set(["pending", "processing"]);

function TasksContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const moduleId = searchParams.get("module");
  const { data: modules, isLoading: modulesLoading } = useModules();
  const reload = useReloadModules();
  const queryClient = useQueryClient();
  const mod = modules?.find((m) => m.id === moduleId);
  const [ui, setUi] = useState<ModuleUI | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const autoOpenedFor = useRef<string | null>(null);

  const safeSchema = useMemo(
    () => (mod ? stripMockFieldsFromSchema(mod.input_schema) : {}),
    [mod]
  );

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", moduleId],
    queryFn: () => {
      const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
      return apiClient.get<QueueTask[]>(`/api/tasks${q}`, { auth: false });
    },
    refetchInterval: (query) => {
      const list = query.state.data ?? [];
      const hasActive = list.some((t) => ACTIVE.has(t.status));
      return hasActive ? 1500 : 8000;
    },
  });

  useEffect(() => {
    let cancelled = false;
    setUi(null);
    if (!moduleId) return;
    void loadModuleUI(moduleId).then((m) => {
      if (!cancelled) setUi(m);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  useEffect(() => {
    if (!tasks.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && tasks.some((t) => t.id === selectedId)) return;
    const preferred =
      tasks.find((t) => ACTIVE.has(t.status)) ?? tasks[0] ?? null;
    setSelectedId(preferred?.id ?? null);
  }, [tasks, selectedId]);

  // Open input once when landing on a module with an empty queue
  useEffect(() => {
    if (!moduleId || !mod || tasksLoading) return;
    if (tasks.length > 0) return;
    if (autoOpenedFor.current === moduleId) return;
    autoOpenedFor.current = moduleId;
    setParamsOpen(true);
  }, [moduleId, mod, tasks.length, tasksLoading]);

  function selectModule(id: string) {
    startTransition(() => {
      router.push(`/tasks?module=${encodeURIComponent(id)}`);
    });
  }

  async function submit(values: Record<string, unknown>) {
    if (!mod) return;
    setSubmitError(null);
    try {
      const created = await apiClient.post<QueueTask>(
        "/api/tasks",
        {
          module_id: mod.id,
          input_params: values,
        },
        { auth: false }
      );
      if (created?.id) setSelectedId(created.id);
      setParamsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setSubmitError(msg);
    }
  }

  const Form = ui?.Form;
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const selectedManifest = modules?.find(
    (m) => m.id === selectedTask?.module_id
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {mod?.name ?? "任务"}
        </h1>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            disabled={reload.isPending}
            onClick={() => reload.mutate()}
            aria-label="刷新"
          >
            <RefreshCw
              className={cn("h-4 w-4", reload.isPending && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setParamsOpen(true)}
          >
            <Plus className="h-4 w-4" />
            输入
          </Button>
        </div>
      </div>

      <TaskProgressHeader
        task={selectedTask}
        tasks={tasks}
        modules={modules}
        selectedId={selectedId}
        onSelect={setSelectedId}
        moduleId={moduleId ?? undefined}
        tasksLoading={tasksLoading}
      />

      <TaskResultStage task={selectedTask} manifest={selectedManifest} />

      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader className="mb-3">
            <DialogTitle>任务输入</DialogTitle>
          </DialogHeader>

          <section className="mb-4 space-y-2">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              模块
            </h2>
            {modulesLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : (
              <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md border border-border/60 p-1">
                {(modules ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectModule(m.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-left text-sm transition",
                      moduleId === m.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/80 hover:bg-accent/70"
                    )}
                  >
                    {m.name}
                  </button>
                ))}
                {(modules?.length ?? 0) === 0 && (
                  <span className="px-2 py-1.5 text-sm text-muted-foreground">
                    暂无可用模块
                  </span>
                )}
              </div>
            )}
          </section>

          {mod ? (
            <section className="space-y-3 border-t border-border/60 pt-3">
              {submitError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <div className="font-semibold">提交失败</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs">
                    {submitError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7"
                    onClick={() => setSubmitError(null)}
                  >
                    关闭
                  </Button>
                </div>
              ) : null}

              {Form ? (
                <Form
                  schema={safeSchema}
                  manifest={mod}
                  onSubmit={submit}
                  submitLabel="运行"
                />
              ) : (
                <DynamicForm
                  schema={safeSchema}
                  onSubmit={submit}
                  submitLabel="运行"
                  progressive
                />
              )}
            </section>
          ) : (
            <p className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
              选择模块后填写参数。
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">加载中…</p>}
    >
      <TasksContent />
    </Suspense>
  );
}
