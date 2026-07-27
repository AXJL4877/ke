/** 与 ke/backend/core/progress_stages.py、scripts/docs/specs/TASK_PROGRESS.md 同步 */

export type ProgressStageMeta = {
  id: string;
  label: string;
  anchor: number;
};

export const BUSINESS_STAGES: Record<string, ProgressStageMeta> = {
  fetch_data: { id: "fetch_data", label: "拉取数据", anchor: 8 },
  write_copy: { id: "write_copy", label: "撰写文案", anchor: 18 },
  render_cover: { id: "render_cover", label: "渲封面", anchor: 30 },
  render_video: { id: "render_video", label: "渲画面", anchor: 45 },
  voiceover: { id: "voiceover", label: "配音", anchor: 60 },
  mix_voice: { id: "mix_voice", label: "混解说", anchor: 72 },
  mix_bgm: { id: "mix_bgm", label: "叠 BGM", anchor: 82 },
  export: { id: "export", label: "导出成片", anchor: 90 },
  publish_prepare: { id: "publish_prepare", label: "发布预填", anchor: 96 },
  done: { id: "done", label: "完成", anchor: 100 },
  ensure_deps: { id: "ensure_deps", label: "探活依赖", anchor: 12 },
  upload: { id: "upload", label: "上传素材", anchor: 94 },
  transcribe: { id: "transcribe", label: "转写", anchor: 55 },
  download: { id: "download", label: "下载源片", anchor: 25 },
};

export const PROGRESS_PRESETS: Record<string, string[]> = {
  "fund-flow-daily": [
    "fetch_data",
    "write_copy",
    "render_cover",
    "render_video",
    "voiceover",
    "mix_voice",
    "mix_bgm",
    "export",
    "publish_prepare",
  ],
  "transcript-pipeline": ["download", "transcribe", "write_copy", "export"],
  "voice-only": ["voiceover", "done"],
  "bgm-only": ["mix_bgm", "export"],
};

const SHELL_STAGES = new Set(["validate", "load", "run", "persist"]);

export function isBusinessStage(id: string | null | undefined): boolean {
  if (!id) return false;
  return id in BUSINESS_STAGES;
}

export function isShellStage(id: string | null | undefined): boolean {
  if (!id) return false;
  return SHELL_STAGES.has(id);
}

export function stageDisplayLabel(id: string | null | undefined): string {
  if (!id) return "";
  return BUSINESS_STAGES[id]?.label || id;
}

/** Pick pipeline chips: module declaration > preset containing current stage > fund-flow default if business */
export function resolveProgressPipeline(
  declared: string[] | null | undefined,
  currentStage: string | null | undefined
): string[] | null {
  if (declared && declared.length > 0) return declared;
  if (currentStage && isBusinessStage(currentStage)) {
    for (const steps of Object.values(PROGRESS_PRESETS)) {
      if (steps.includes(currentStage)) return steps;
    }
    return [currentStage];
  }
  return null;
}
