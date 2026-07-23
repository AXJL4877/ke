/**
 * Shell <-> modules registry: prefer GET /api/modules only.
 * Do not hardcode business module ids here (MODULE_SPEC §9.2).
 */
import type { ModuleManifest } from "@/types/module";

const LOCAL_MANIFESTS: ModuleManifest[] = [];

export function mergeModuleRegistry(
  remote: ModuleManifest[] = [],
  opts?: { includeHidden?: boolean }
): ModuleManifest[] {
  const map = new Map<string, ModuleManifest>();
  for (const m of LOCAL_MANIFESTS) map.set(m.id, m);
  for (const m of remote) map.set(m.id, m);
  let list = Array.from(map.values());
  if (!opts?.includeHidden) {
    list = list.filter((m) => !m.ui_hint?.hidden);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getLocalModules(): ModuleManifest[] {
  return [...LOCAL_MANIFESTS];
}

export type { ModuleManifest };
