"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { mergeModuleRegistry } from "@/modules/_registry";
import type { IntegrationReport, ModuleManifest } from "@/types/module";

export function useModules() {
  return useQuery({
    queryKey: ["modules"],
    staleTime: 30_000,
    queryFn: async () => {
      const remote = await apiClient.get<ModuleManifest[]>("/api/modules", {
        auth: false,
      });
      return mergeModuleRegistry(remote);
    },
  });
}

/** Includes ui_hint.hidden modules — for deep-link / agent acceptance (e.g. echo). */
export function useModulesAll() {
  return useQuery({
    queryKey: ["modules", "all"],
    staleTime: 30_000,
    queryFn: async () => {
      const remote = await apiClient.get<ModuleManifest[]>("/api/modules", {
        auth: false,
      });
      return mergeModuleRegistry(remote, { includeHidden: true });
    },
  });
}

export function useReloadModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const remote = await apiClient.post<ModuleManifest[]>(
        "/api/modules/reload",
        {},
        { auth: false }
      );
      return mergeModuleRegistry(remote);
    },
    onSuccess: (data) => {
      qc.setQueryData(["modules"], data);
      void qc.invalidateQueries({ queryKey: ["modules"] });
      void qc.invalidateQueries({ queryKey: ["module-integration"] });
    },
  });
}

export function useModuleIntegration(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ["module-integration", moduleId],
    enabled: Boolean(moduleId),
    staleTime: 15_000,
    queryFn: async () => {
      return apiClient.get<IntegrationReport>(
        `/api/modules/${encodeURIComponent(moduleId!)}/integration`,
        { auth: false }
      );
    },
  });
}
