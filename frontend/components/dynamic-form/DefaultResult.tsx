"use client";

import { Button } from "@/components/ui/button";
import type { ModuleManifest } from "@/types/module";
import { useMemo, useState } from "react";

type Props = {
  result: Record<string, unknown>;
  manifest: ModuleManifest;
};

function isProbablyUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/|^\/[\w.-]/.test(v);
}

/** 默认 Result：标题 + meta 一行，主内容一种预览（MODULE_SPEC §9.5） */
export function DefaultResult({ result, manifest }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const entries = useMemo(() => Object.entries(result || {}), [result]);
  const schema = manifest.output_schema || {};

  const primary = useMemo(() => {
    const fileKey = entries.find(([k, v]) => {
      const t = schema[k]?.type;
      return (t === "file" || t === "file[]") && isProbablyUrl(v);
    });
    if (fileKey) return { kind: "file" as const, key: fileKey[0], value: fileKey[1] };

    const long = entries.find(
      ([, v]) => typeof v === "string" && (v as string).length > 80
    );
    if (long) return { kind: "text" as const, key: long[0], value: long[1] as string };

    const first = entries[0];
    if (first && typeof first[1] === "string") {
      return { kind: "text" as const, key: first[0], value: first[1] as string };
    }
    return null;
  }, [entries, schema]);

  const meta = entries
    .filter(([k]) => k !== primary?.key)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .slice(0, 4)
    .map(([k, v]) => `${schema[k]?.label || k}: ${v}`)
    .join(" · ");

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">暂无结果</p>;
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-medium">结果</h3>
        {meta ? (
          <span className="text-xs text-muted-foreground">{meta}</span>
        ) : null}
      </div>

      {primary?.kind === "file" && typeof primary.value === "string" ? (
        <div className="space-y-2">
          {/\.(mp4|webm|mov)(\?|$)/i.test(primary.value) ||
          schema[primary.key]?.mime?.startsWith("video/") ? (
            <video src={primary.value} controls className="w-full max-h-[420px] rounded-md bg-black" />
          ) : /\.(png|jpe?g|webp|gif)(\?|$)/i.test(primary.value) ||
            schema[primary.key]?.mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primary.value} alt="" className="max-h-[420px] rounded-md" />
          ) : (
            <a
              className="text-sm underline"
              href={primary.value}
              target="_blank"
              rel="noreferrer"
            >
              打开文件
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={primary.value} download>
                下载
              </a>
            </Button>
          </div>
        </div>
      ) : null}

      {primary?.kind === "text" ? (
        <div className="space-y-2">
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background p-3 text-sm">
            {primary.value}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyText("复制", primary.value)}
            >
              {copied === "复制" ? "已复制" : "复制"}
            </Button>
          </div>
        </div>
      ) : null}

      {!primary ? (
        <pre className="max-h-[240px] overflow-auto rounded-md border border-input p-3 text-xs text-muted-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
