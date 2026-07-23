"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { KeLifecycle } from "@/components/layout/KeLifecycle";
import { useUIStore } from "@/stores/useUIStore";
import { cn } from "@/lib/utils";

export function Providers({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <QueryClientProvider client={queryClient}>
      <KeLifecycle />
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} />
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-[margin] duration-200"
          )}
        >
          <Header />
          <main
            id="ke-main"
            data-testid="ke-main"
            className="page-fade flex-1 p-6 md:p-8"
          >
            {children}
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
