"use client";

import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AssetListItem = {
  id: string;
  title: string;
  kind: string;
  module_id: string;
  source_service: string | null;
  task_id: string | null;
  source: string;
  mime: string | null;
  url: string | null;
  has_file: boolean;
  has_text: boolean;
  preview: string | null;
  tags: string[];
  created_at: string | null;
};

type AssetDetail = AssetListItem & {
  text_content: string | null;
  storage_key: string | null;
  bytes_size: number | null;
  meta: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

const KIND_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "text", label: "文案" },
  { value: "subtitle", label: "字幕" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
  { value: "image", label: "图片" },
  { value: "json", label: "结构化" },
  { value: "file", label: "文件" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.filter((k) => k.value).map((k) => [k.value, k.label])
);

function fileHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/files/")) return `/backend${url}`;
  return url;
}

export default function AssetsPage() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [kind, setKind] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const listKey = ["assets", kind, moduleId, qDebounced] as const;
  const { data: assets, isLoading, isError, error } = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (moduleId) params.set("module_id", moduleId);
      if (qDebounced) params.set("q", qDebounced);
      params.set("limit", "100");
      const qs = params.toString();
      return apiClient.get<AssetListItem[]>(
        `/api/assets${qs ? `?${qs}` : ""}`,
        { auth: false }
      );
    },
  });

  const detail = useQuery({
    queryKey: ["asset", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () =>
      apiClient.get<AssetDetail>(`/api/assets/${selectedId}`, { auth: false }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/api/assets/${id}`, { auth: false }),
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets || []) {
      if (a.module_id) set.add(a.module_id);
    }
    return Array.from(set).sort();
  }, [assets]);

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const selected = detail.data;
  const href = fileHref(selected?.url);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">资产</h1>
          <p className="text-sm text-muted-foreground">
            任务产出会自动收纳到这里，方便查找和复用。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="搜索标题或正文"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="h-10 max-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">全部模块</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}
        {isError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error instanceof ApiError
              ? error.message
              : "无法加载资产列表"}
          </p>
        )}

        <ul className="space-y-2">
          {(assets || []).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "w-full rounded-md border border-border/70 px-3 py-2.5 text-left transition-colors",
                  selectedId === a.id
                    ? "border-primary/40 bg-accent"
                    : "hover:bg-accent/60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-snug">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {KIND_LABEL[a.kind] || a.kind}
                  </span>
                </div>
                {a.preview ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {a.preview}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {a.module_id}
                  {a.created_at
                    ? ` · ${new Date(a.created_at).toLocaleString()}`
                    : ""}
                </p>
              </button>
            </li>
          ))}
          {!isLoading && assets && assets.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">
              还没有资产。完成一次任务后会自动出现在这里。
            </li>
          ) : null}
        </ul>
      </div>

      <div className="min-h-[16rem] rounded-lg border border-border/70 bg-[hsl(var(--card)/0.5)] p-5">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">选择左侧一条资产查看详情。</p>
        ) : detail.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : selected ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold leading-snug">
                {selected.title}
              </h2>
              <p className="text-xs text-muted-foreground">
                {KIND_LABEL[selected.kind] || selected.kind}
                {selected.module_id ? ` · ${selected.module_id}` : ""}
              </p>
            </div>

            {selected.tags?.includes("可疑") ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                标记为可疑，请核对是否为真实结果。
              </div>
            ) : null}

            {selected.text_content ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    正文
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => void copyText(selected.text_content || "")}
                  >
                    {copied ? "已复制" : "复制"}
                  </Button>
                </div>
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/80 p-3 text-sm leading-relaxed">
                  {selected.text_content}
                </pre>
              </div>
            ) : null}

            {href ? (
              <div className="space-y-2">
                {selected.kind === "audio" ? (
                  <audio controls className="w-full" src={href} />
                ) : null}
                {selected.kind === "video" ? (
                  <video controls className="max-h-72 w-full rounded-md" src={href} />
                ) : null}
                {selected.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={href}
                    alt={selected.title}
                    className="max-h-72 rounded-md object-contain"
                  />
                ) : null}
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm text-primary underline-offset-4 hover:underline"
                >
                  打开 / 下载
                </a>
              </div>
            ) : null}

            {!selected.text_content && !href ? (
              <p className="text-sm text-muted-foreground">暂无可展示内容。</p>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              {selected.task_id ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/tasks">查看任务</Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(selected.id)}
              >
                {remove.isPending ? "删除中…" : "删除资产"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-destructive">资产不存在或已删除。</p>
        )}
      </div>
    </div>
  );
}
