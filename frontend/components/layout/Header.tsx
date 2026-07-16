"use client";

import { useUIStore } from "@/stores/useUIStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Header() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <Button variant="ghost" size="sm" onClick={toggleSidebar} type="button">
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
