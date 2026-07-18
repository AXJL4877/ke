/**
 * 自定义 Form / Result 自动发现（MODULE_SPEC.md §9.2）
 *
 * 约定：frontend/modules/<id>/index.ts 导出 { Form?, Result? }
 * 无 index.ts → 使用 DynamicForm / 默认 Result
 * 禁止在 tasks / 导航 / worker 里写死 module_id
 */
import type { ComponentType } from "react";
import type { ModuleManifest } from "@/types/module";

export type ModuleFormProps = {
  schema: ModuleManifest["input_schema"];
  manifest: ModuleManifest;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
};

export type ModuleResultProps = {
  result: Record<string, unknown>;
  manifest: ModuleManifest;
};

export type ModuleUI = {
  Form?: ComponentType<ModuleFormProps>;
  Result?: ComponentType<ModuleResultProps>;
};

const cache = new Map<string, Promise<ModuleUI | null>>();

export async function loadModuleUI(id: string): Promise<ModuleUI | null> {
  if (!id || id.startsWith("_")) return null;
  const hit = cache.get(id);
  if (hit) return hit;

  const pending = (async (): Promise<ModuleUI | null> => {
    try {
      const mod = (await import(
        /* webpackMode: "lazy" */
        `./${id}/index`
      )) as ModuleUI;
      if (!mod?.Form && !mod?.Result) return null;
      return mod;
    } catch {
      return null;
    }
  })();

  cache.set(id, pending);
  return pending;
}

/** 开发热加载后可清缓存 */
export function clearModuleUICache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}
