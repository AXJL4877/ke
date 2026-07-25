"use client";

import { useEffect, useRef } from "react";

const TAB_KEY = "ke:open-tabs-v2";
const SHUTDOWN_URL = "/backend/api/system/shutdown";
/** 无心跳超过此时长视为僵尸标签（崩溃/强杀未走 pagehide） */
const STALE_MS = 20_000;
const HEARTBEAT_MS = 4_000;
/**
 * 关页后延迟再停后端：刷新/热更新会在此窗口内重新注册标签并取消停机，
 * 避免「刷新前端把下游全杀了」。
 */
const SHUTDOWN_DELAY_MS = 2_500;

type TabEntry = { id: string; ts: number };

let exitArmed = false;
let pendingShutdown: ReturnType<typeof setTimeout> | null = null;

function cancelPendingShutdown() {
  if (pendingShutdown != null) {
    clearTimeout(pendingShutdown);
    pendingShutdown = null;
  }
}

function shutdownBeacon(reason: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const body = new Blob([JSON.stringify({ reason })], {
        type: "application/json",
      });
      if (navigator.sendBeacon(SHUTDOWN_URL, body)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(SHUTDOWN_URL, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

function scheduleShutdownIfNoTabs() {
  cancelPendingShutdown();
  pendingShutdown = setTimeout(() => {
    pendingShutdown = null;
    if (exitArmed) return;
    if (prune(readTabs()).length === 0) {
      shutdownBeacon("last-tab");
    }
  }, SHUTDOWN_DELAY_MS);
}

function readTabs(): TabEntry[] {
  try {
    const raw = window.localStorage.getItem(TAB_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is TabEntry =>
        x &&
        typeof x === "object" &&
        typeof (x as TabEntry).id === "string" &&
        typeof (x as TabEntry).ts === "number"
    );
  } catch {
    return [];
  }
}

function writeTabs(entries: TabEntry[]) {
  if (entries.length === 0) {
    window.localStorage.removeItem(TAB_KEY);
    window.localStorage.removeItem("ke:open-tab-ids");
  } else {
    window.localStorage.setItem(TAB_KEY, JSON.stringify(entries));
  }
}

function prune(entries: TabEntry[], now = Date.now()): TabEntry[] {
  return entries.filter((e) => now - e.ts < STALE_MS);
}

function upsertTab(tabId: string) {
  cancelPendingShutdown();
  const now = Date.now();
  const others = prune(readTabs(), now).filter((e) => e.id !== tabId);
  writeTabs([...others, { id: tabId, ts: now }]);
}

function removeTab(tabId: string): TabEntry[] {
  const now = Date.now();
  const remaining = prune(readTabs(), now).filter((e) => e.id !== tabId);
  writeTabs(remaining);
  return remaining;
}

/** Track open KE tabs; shutdown all backends when the last live tab closes. */
export function KeLifecycle() {
  const tabId = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}`
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    upsertTab(tabId.current);

    const beat = window.setInterval(() => {
      if (exitArmed) return;
      upsertTab(tabId.current);
    }, HEARTBEAT_MS);

    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted || exitArmed) return;
      const remaining = removeTab(tabId.current);
      if (remaining.length === 0) {
        scheduleShutdownIfNoTabs();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener("pagehide", onPageHide);
      // React 卸载 / HMR：只摘名；若短时无新标签再注册，延迟停机可取消
      const remaining = removeTab(tabId.current);
      if (remaining.length === 0 && !exitArmed) {
        scheduleShutdownIfNoTabs();
      }
    };
  }, []);

  return null;
}

/** Explicit exit: stop ke + all contract local backends, then try to close tab. */
export async function exitKeStudio(): Promise<void> {
  exitArmed = true;
  cancelPendingShutdown();
  writeTabs([]);
  try {
    await fetch(SHUTDOWN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "exit-button" }),
    });
  } catch {
    shutdownBeacon("exit-button");
  }
  window.setTimeout(() => {
    window.close();
  }, 400);
}
