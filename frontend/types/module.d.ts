/**
 * module.json 类型 — 与仓库根 MODULE_SPEC.md 对齐
 */
export type FieldType = "string" | "number" | "enum" | "boolean" | "file" | "file[]";

export type FieldFormat = "textarea";

export type FieldSpec = {
  type: FieldType;
  /** string 专用：textarea = 多行（§3） */
  format?: FieldFormat;
  required?: boolean;
  label?: string;
  description?: string;
  default?: unknown;
  options?: unknown[];
  accept?: string[];
  max_size_mb?: number;
  mime?: string;
  min?: number;
  max?: number;
  max_length?: number;
};

export type CapabilityVerify =
  | { method: string; path: string; expect?: Record<string, unknown>; body?: unknown }
  | { manual: string };

export type ModuleCapability = {
  id: string;
  desc: string;
  kind: "core" | "aux" | "invariant" | string;
  must_keep: boolean;
  endpoints?: string[];
  verify: CapabilityVerify;
};

export type ModuleManifest = {
  id: string;
  name: string;
  description: string;
  version: string | number;
  category: string;
  input_schema: Record<string, FieldSpec>;
  output_schema: Record<string, FieldSpec>;
  ui_hint?: {
    form_layout?: string;
    icon?: string;
    estimated_time_seconds?: number;
    service_panel?: boolean;
    hidden?: boolean;
  };
  runtime: {
    async?: boolean;
    queue?: string;
    timeout_seconds?: number;
  };
  local?: Record<string, unknown>;
  capabilities?: ModuleCapability[];
  /** 业务进度环节 id 列表，见 TASK_PROGRESS.md */
  progress_pipeline?: string[];
  /** 或引用预设：fund-flow-daily / transcript-pipeline … */
  progress_preset?: string;
  /** 壳注入：防 mock / capabilities 警告 */
  shell?: {
    warnings?: string[];
    stripped_mock_fields?: string[];
    allow_mock?: boolean;
    capabilities_ok?: boolean;
  };
};

export type IntegrationReport = {
  module_id: string;
  ok: boolean;
  capabilities_declared: number;
  must_keep_count: number;
  auto_verify_count: number;
  manual_verify_count: number;
  items: Array<{
    id: string;
    desc: string;
    kind: string;
    must_keep: boolean;
    endpoints: string[];
    verify_mode: string;
    verify: Record<string, unknown>;
    host_action: string;
  }>;
  message: string;
  warnings: string[];
  stripped_mock_fields: string[];
  allow_mock: boolean;
};
