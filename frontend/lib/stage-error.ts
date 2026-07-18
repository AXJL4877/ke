/** Parse "[stage|中文标签] 模块 xxx：message" from backend StageError */
export type ParsedStageError = {
  stage: string | null;
  stageLabel: string | null;
  message: string;
  raw: string;
};

const STAGE_LABELS: Record<string, string> = {
  validate: "校验",
  load: "加载模块",
  run: "执行",
  persist: "落库",
};

export function parseStageError(raw: string | null | undefined): ParsedStageError {
  const text = (raw || "").trim();
  if (!text) {
    return { stage: null, stageLabel: null, message: "", raw: "" };
  }
  const m = text.match(/^\[([a-z]+)(?:\|([^\]]+))?\]\s*(.*)$/is);
  if (!m) {
    return { stage: null, stageLabel: null, message: text, raw: text };
  }
  const stage = m[1].toLowerCase();
  const stageLabel = m[2] || STAGE_LABELS[stage] || stage;
  return {
    stage,
    stageLabel,
    message: (m[3] || "").trim() || text,
    raw: text,
  };
}

export { STAGE_LABELS };
