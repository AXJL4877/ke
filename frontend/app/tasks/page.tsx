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
  useState,
} from "react";
import {
  loadModuleUI,
  type ModuleUI,
} from "@/modules/_ui-registry";
import { stripMockFieldsFromSchema } from "@/lib/anti-mock";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, PanelRight } from "lucide-react";

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
  const [submitOk, setSubmitOk] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(true);

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

  function selectModule(id: string) {
    startTransition(() => {
      router.push(`/tasks?module=${encodeURIComponent(id)}`);
    });
  }

  async function submit(values: Record<string, unknown>) {
    if (!mod) return;
    setSubmitError(null);
    setSubmitOk(false);
    try {
      const created = await apiClient.post<QueueTask>(
        "/api/tasks",
        {
          module_id: mod.id,
          input_params: values,
        },
        { auth: false }
      );
      setSubmitOk(true);
      if (created?.id) setSelectedId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      window.setTimeout(() => setSubmitOk(false), 2500);
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
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">任务</h1>
          <p className="text-sm text-muted-foreground">
            上方看进度，中间看成果，右侧填参数。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
          className="text-muted-foreground"
        >
          {reload.isPending ? "刷新中…" : "刷新"}
        </Button>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <TaskResultStage task={selectedTask} manifest={selectedManifest} />

        <aside className="order-first space-y-3 lg:order-none lg:sticky lg:top-20 lg:self-start">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border/80 bg-card/80 px-3 py-2 text-sm font-medium lg:cursor-default"
            onClick={() => {
              if (window.matchMedia("(max-width: 1023px)").matches) {
                setParamsOpen((v) => !v);
              }
            }}
          >
            <span className="flex items-center gap-2">
              <PanelRight className="h-4 w-4 text-muted-foreground" />
              参数
              {mod ? (
                <span className="font-normal text-muted-foreground">
                  · {mod.name}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform lg:hidden",
                paramsOpen ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>

          <div
            className={cn(
              "space-y-4 rounded-xl border border-border/80 bg-card p-4 shadow-[0_8px_24px_-18px_hsl(215_30%_20%/0.18)]",
              !paramsOpen && "hidden lg:block"
            )}
          >
            <section className="space-y-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                模块
              </h2>
              {modulesLoading ? (
                <p className="text-sm text-muted-foreground">加载中…</p>
              ) : (
                <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
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
                    <span className="text-sm text-muted-foreground">
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
                {submitOk ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
                    已提交，成果将出现在中间。
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
          </div>
        </aside>
      </div>
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
