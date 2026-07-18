"use client";

import { useUIStore } from "@/stores/useUIStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PanelLeft } from "lucide-react";

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
      >
        <PanelLeft className="h-4 w-4" />
        菜单
      </Button>
      <div className="flex items-center gap-3 text-sm">
        {isAuthenticated ? (
          <>
            <span className="text-muted-foreground">{user?.username}</span>
            <Button variant="outline" size="sm" type="button" onClick={logout}>
              退出
            </Button>
          </>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/login">登录</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
