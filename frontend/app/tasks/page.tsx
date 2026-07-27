"use client";

import { TaskProgressHeader } from "@/components/task-queue-list/TaskProgressHeader";
import { TaskResultStage } from "@/components/task-queue-list/TaskResultStage";
import type { QueueTask } from "@/components/task-queue-list/TaskQueueStrip";
import { DynamicForm } from "@/components/dynamic-form/DynamicForm";
import { useModules, useModulesAll, useReloadModules } from "@/hooks/useModules";
import { useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  AGENT_TESTID,
  findMacro,
  macrosForModule,
} from "@/lib/agent-macros";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Suspense,
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
  const moduleId = searchParams.get("module");
  const openParam = searchParams.get("open");
  const macroId = searchParams.get("macro");
  const { data: modules } = useModules();
  const { data: modulesAll } = useModulesAll();
  const reload = useReloadModules();
  const queryClient = useQueryClient();
  const mod =
    modulesAll?.find((m) => m.id === moduleId) ??
    modules?.find((m) => m.id === moduleId);
  const [ui, setUi] = useState<ModuleUI | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const autoOpenedFor = useRef<string | null>(null);
  const macroApplied = useRef<string | null>(null);

  const safeSchema = useMemo(
    () => (mod ? stripMockFieldsFromSchema(mod.input_schema) : {}),
    [mod]
  );

  const moduleMacros = useMemo(
    () => (moduleId ? macrosForModule(moduleId) : []),
    [moduleId]
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
      // Faster while running so stage chips / % feel live
      return hasActive ? 800 : 8000;
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

  // Open input: empty queue, or ?open=1
  useEffect(() => {
    if (!moduleId || !mod || tasksLoading) return;
    if (openParam === "1" || openParam === "true") {
      setParamsOpen(true);
      return;
    }
    if (tasks.length > 0) return;
    if (autoOpenedFor.current === moduleId) return;
    autoOpenedFor.current = moduleId;
    setParamsOpen(true);
  }, [moduleId, mod, tasks.length, tasksLoading, openParam]);

  // Apply ?macro=
  useEffect(() => {
    if (!moduleId || !mod || !macroId) return;
    const key = `${moduleId}:${macroId}`;
    if (macroApplied.current === key) return;
    const macro = findMacro(macroId);
    if (!macro || macro.module_id !== moduleId) return;
    macroApplied.current = key;
    setFormInitial(macro.input_params);
    setParamsOpen(true);
    if (macro.auto_run) {
      void submit(macro.input_params);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot macro apply
  }, [moduleId, mod, macroId]);

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

  function applyMacro(id: string) {
    const macro = findMacro(id);
    if (!macro) return;
    setFormInitial({ ...macro.input_params });
    if (macro.auto_run) {
      void submit(macro.input_params);
    }
  }

  const Form = ui?.Form;
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const selectedManifest =
    modulesAll?.find((m) => m.id === selectedTask?.module_id) ??
    modules?.find((m) => m.id === selectedTask?.module_id);

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
            data-testid={AGENT_TESTID.taskReload}
          >
            <RefreshCw
              className={cn("h-4 w-4", reload.isPending && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!mod}
            onClick={() => setParamsOpen(true)}
            data-testid={AGENT_TESTID.taskOpenInput}
          >
            <Plus className="h-4 w-4" />
            输入
          </Button>
        </div>
      </div>

      <TaskProgressHeader
        task={selectedTask}
        tasks={tasks}
        modules={modulesAll ?? modules}
        selectedId={selectedId}
        onSelect={setSelectedId}
        moduleId={moduleId ?? undefined}
        tasksLoading={tasksLoading}
      />

      <TaskResultStage task={selectedTask} manifest={selectedManifest} />

      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader className="mb-3">
            <DialogTitle>{mod ? mod.name : "输入"}</DialogTitle>
          </DialogHeader>

          {mod ? (
            <div className="space-y-3">
              {moduleMacros.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {moduleMacros.map((m) => (
                    <Button
                      key={m.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      data-testid={AGENT_TESTID.macro(m.id)}
                      onClick={() => applyMacro(m.id)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              ) : null}

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
                  initialValues={formInitial}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">请先选择模块</p>
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
