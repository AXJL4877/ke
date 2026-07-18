"use client";

import { TaskQueueList } from "@/components/task-queue-list/TaskQueueList";
import { DynamicForm } from "@/components/dynamic-form/DynamicForm";
import { useModules } from "@/hooks/useModules";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Suspense,
  startTransition,
  useEffect,
  useState,
} from "react";
import {
  loadModuleUI,
  type ModuleUI,
} from "@/modules/_ui-registry";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function TasksContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const moduleId = searchParams.get("module");
  const { data: modules, isLoading: modulesLoading } = useModules();
  const queryClient = useQueryClient();
  const mod = modules?.find((m) => m.id === moduleId);
  const [ui, setUi] = useState<ModuleUI | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

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
      await apiClient.post(
        "/api/tasks",
        {
          module_id: mod.id,
          input_params: values,
        },
        { auth: false }
      );
      setSubmitOk(true);
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

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            任务
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">提交与跟踪</h1>
          <p className="text-sm text-muted-foreground">
            统一表单入口；失败时按校验 / 加载 / 执行 / 落库节点明示。
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            选择模块
          </h2>
          {modulesLoading ? (
            <p className="text-sm text-muted-foreground">加载模块…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(modules ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectModule(m.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    moduleId === m.id
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/60"
                  )}
                >
                  {m.name}
                </button>
              ))}
              {(modules?.length ?? 0) === 0 && (
                <span className="text-sm text-muted-foreground">暂无可用模块</span>
              )}
            </div>
          )}
        </section>

        {mod ? (
          <section className="shell-card space-y-4 rounded-xl p-5">
            <div>
              <h2 className="text-lg font-medium tracking-tight">{mod.name}</h2>
              {mod.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {mod.description}
                </p>
              ) : null}
            </div>

            {submitError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <div className="font-semibold">提交失败</div>
                <p className="mt-1 whitespace-pre-wrap">{submitError}</p>
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
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
                已提交，请在右侧队列查看进度。
              </div>
            ) : null}

            {Form ? (
              <Form
                schema={mod.input_schema}
                manifest={mod}
                onSubmit={submit}
                submitLabel="运行模块"
              />
            ) : (
              <DynamicForm
                schema={mod.input_schema}
                onSubmit={submit}
                submitLabel="运行模块"
              />
            )}
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
            请选择上方模块，或从侧栏 / 工作台进入。
          </div>
        )}
      </div>

      <aside className="shell-card h-fit rounded-xl p-5 lg:sticky lg:top-20">
        <TaskQueueList moduleId={moduleId ?? undefined} modules={modules} />
      </aside>
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
