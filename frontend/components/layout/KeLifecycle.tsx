"use client";

import { useEffect, useRef } from "react";

const TAB_KEY = "ke:open-tab-ids";
const SHUTDOWN_URL = "/backend/api/system/shutdown";

let exitArmed = false;

function shutdownBeacon() {
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(SHUTDOWN_URL, "{}");
    return;
  }
  void fetch(SHUTDOWN_URL, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

function readTabIds(): string[] {
  try {
    const raw = window.localStorage.getItem(TAB_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeTabIds(ids: string[]) {
  if (ids.length === 0) {
    window.localStorage.removeItem(TAB_KEY);
  } else {
    window.localStorage.setItem(TAB_KEY, JSON.stringify(ids));
  }
}

function registerTab(tabId: string) {
  const ids = readTabIds();
  if (!ids.includes(tabId)) ids.push(tabId);
  writeTabIds(ids);
}

function unregisterTab(tabId: string): string[] {
  const ids = readTabIds().filter((id) => id !== tabId);
  writeTabIds(ids);
  return ids;
}

/** Track open KE tabs; shutdown all backends when the last tab closes. */
export function KeLifecycle() {
  const tabId = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab-${Date.now()}`
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    registerTab(tabId.current);

    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted || exitArmed) return;
      const remaining = unregisterTab(tabId.current);
      if (remaining.length === 0) {
        shutdownBeacon();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      unregisterTab(tabId.current);
    };
  }, []);

  return null;
}

/** Explicit exit: stop ke + all contract local backends, then try to close tab. */
export async function exitKeStudio(): Promise<void> {
  exitArmed = true;
  writeTabIds([]);
  try {
    await fetch(SHUTDOWN_URL, { method: "POST" });
  } catch {
    shutdownBeacon();
  }
  window.setTimeout(() => {
    window.close();
  }, 400);
}
