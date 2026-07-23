"use client";

import { useUIStore } from "@/stores/useUIStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { exitKeStudio } from "@/components/layout/KeLifecycle";
import Link from "next/link";
import { LogOut, PanelLeft } from "lucide-react";

export function Header() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-[hsl(var(--background)/0.75)] px-4 backdrop-blur-md">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSidebar}
        type="button"
        className="gap-1.5"
        aria-label="菜单"
        data-testid="ke-header-menu"
      >
        <PanelLeft className="h-4 w-4" />
        菜单
      </Button>
      <div className="flex items-center gap-2 text-sm">
        {isAuthenticated ? (
          <span className="hidden text-muted-foreground sm:inline">
            {user?.username}
          </span>
        ) : null}
        {isAuthenticated ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={logout}
            data-testid="ke-header-logout"
          >
            登出
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link href="/login" data-testid="ke-header-login">
              登录
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="gap-1.5"
          data-testid="ke-header-exit"
          aria-label="退出 KE"
          onClick={() => void exitKeStudio()}
        >
          <LogOut className="h-3.5 w-3.5" />
          退出 KE
        </Button>
      </div>
    </header>
  );
}
