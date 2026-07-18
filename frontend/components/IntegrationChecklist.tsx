"use client";

import type { IntegrationReport } from "@/types/module";

/** 接入 DoD：must_keep 能力清单，防止漏接小功能 */
export function IntegrationChecklist({
  report,
  loading,
}: {
  report?: IntegrationReport;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">加载 capabilities 清单…</p>
    );
  }
  if (!report) return null;

  const mustKeep = report.items.filter((i) => i.must_keep);

  return (
    <div className="space-y-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          接入能力清单（capabilities）
        </h3>
        <span
          className={
            report.ok
              ? "text-[11px] font-medium text-emerald-700"
              : "text-[11px] font-medium text-amber-700"
          }
        >
          {report.ok
            ? `${report.must_keep_count} 项 must_keep`
            : "缺少 capabilities"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{report.message}</p>

      {report.stripped_mock_fields?.length ? (
        <p className="text-xs text-amber-800">
          壳已剥离演示/mock 字段：{report.stripped_mock_fields.join(", ")}
        </p>
      ) : null}

      {(report.warnings || []).length > 0 ? (
        <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-800">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {mustKeep.length > 0 ? (
        <ul className="space-y-1.5">
          {mustKeep.map((item) => (
            <li
              key={item.id}
              className="rounded border border-border/60 bg-background/80 px-2 py-1.5 text-xs"
            >
              <div className="font-medium text-foreground">
                {item.id}{" "}
                <span className="font-normal text-muted-foreground">
                  · {item.kind} · {item.verify_mode}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{item.desc}</p>
              {item.endpoints?.length ? (
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {item.endpoints.join(" · ")}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-primary">{item.host_action}</p>
            </li>
          ))}
        </ul>
      ) : report.ok ? (
        <p className="text-xs text-amber-800">
          已声明 capabilities，但没有 must_keep=true 项——接入时容易漏掉关键小功能。
        </p>
      ) : null}
    </div>
  );
}
