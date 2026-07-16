"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { mergeModuleRegistry } from "@/modules/_registry";
import type { ModuleManifest } from "@/types/module";

export function useModules() {
  return useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      try {
        const remote = await apiClient.get<ModuleManifest[]>("/api/modules", {
          auth: false,
        });
        return mergeModuleRegistry(remote);
      } catch {
        return mergeModuleRegistry([]);
      }
    },
  });
}
