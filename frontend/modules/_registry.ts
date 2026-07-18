/**
 * Shell <-> modules registry: prefer GET /api/modules only.
 * Do not hardcode business module ids here (MODULE_SPEC §9.2).
 */
import type { ModuleManifest } from "@/types/module";

const LOCAL_MANIFESTS: ModuleManifest[] = [];

export function mergeModuleRegistry(
  remote: ModuleManifest[] = []
): ModuleManifest[] {
  const map = new Map<string, ModuleManifest>();
  for (const m of LOCAL_MANIFESTS) map.set(m.id, m);
  for (const m of remote) map.set(m.id, m);
  return Array.from(map.values())
    .filter((m) => !m.ui_hint?.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLocalModules(): ModuleManifest[] {
  return [...LOCAL_MANIFESTS];
}

export type { ModuleManifest };
