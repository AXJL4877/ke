/**
 * module.json 类型 — 与仓库根 MODULE_SPEC.md 对齐
 */
export type FieldType = "string" | "number" | "enum" | "boolean" | "file" | "file[]";

export type FieldSpec = {
  type: FieldType;
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
};
