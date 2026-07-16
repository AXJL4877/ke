/**
 * Shell <-> modules registry: merge remote GET /api/modules with local manifests.
 * Spec: repo-root MODULE_SPEC.md
 */
import type { ModuleManifest } from "@/types/module";
import echoManifest from "./echo/module.json";

const LOCAL_MANIFESTS: ModuleManifest[] = [echoManifest as ModuleManifest];

export function mergeModuleRegistry(
  remote: ModuleManifest[] = []
): ModuleManifest[] {
  const map = new Map<string, ModuleManifest>();
  for (const m of LOCAL_MANIFESTS) map.set(m.id, m);
  for (const m of remote) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getLocalModules(): ModuleManifest[] {
  return [...LOCAL_MANIFESTS];
}

export type { ModuleManifest };
