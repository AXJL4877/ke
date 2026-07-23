"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import type { FieldSpec, ModuleManifest } from "@/types/module";
import { stripMockFieldsFromSchema } from "@/lib/anti-mock";
import { AGENT_TESTID } from "@/lib/agent-macros";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Props = {
  schema: ModuleManifest["input_schema"];
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
  /** Compact: required/main fields first; optional behind toggle (default on for shell) */
  progressive?: boolean;
  /** Prefill / reset when macros or deep-links change */
  initialValues?: Record<string, unknown>;
};

const CONTROL =
  "flex w-full rounded-md border border-input bg-background px-3 text-sm";

export function defaultsFromSchema(schema: Record<string, FieldSpec>) {
  return Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [
      k,
      v.default ?? (v.type === "boolean" ? false : ""),
    ])
  );
}

function isParamField(def: FieldSpec) {
  return def.type === "number" || def.type === "enum" || def.type === "boolean";
}

function hasTextarea(schema: Record<string, FieldSpec>) {
  return Object.values(schema).some(
    (d) => d.type === "string" && d.format === "textarea"
  );
}

/** Prefer human-readable enum labels; hide raw model/API ids when option is "Name · id". */
function humanOptionLabel(opt: string | number | boolean): string {
  const s = String(opt);
  const sep = s.indexOf(" · ");
  if (sep > 0 && sep < s.length - 3) {
    return s.slice(0, sep).trim();
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s) && s.length > 24) {
    return s.split("-").slice(0, 3).join("-");
  }
  return s;
}

function splitProgressive(
  entries: [string, FieldSpec][]
): { primary: [string, FieldSpec][]; more: [string, FieldSpec][] } {
  const primary = entries.filter(
    ([, d]) =>
      d.required ||
      d.format === "textarea" ||
      d.type === "file" ||
      d.type === "file[]"
  );
  const shown =
    primary.length > 0
      ? primary
      : entries.length > 0
        ? [entries[0]]
        : [];
  const shownKeys = new Set(shown.map(([k]) => k));
  const more = entries.filter(([k]) => !shownKeys.has(k));
  return { primary: shown, more };
}

/** Auto-render form from MODULE_SPEC.md §3 / §9 — labels only, no helper paragraphs */
export function DynamicForm({
  schema,
  onSubmit,
  submitLabel = "运行",
  progressive = true,
  initialValues,
}: Props) {
  const safeSchema = stripMockFieldsFromSchema(schema);
  const mergedDefaults = {
    ...defaultsFromSchema(safeSchema),
    ...(initialValues || {}),
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: mergedDefaults,
  });
  const [showMore, setShowMore] = useState(false);

  const schemaKey = JSON.stringify(safeSchema);
  const initialKey = JSON.stringify(initialValues ?? null);

  useEffect(() => {
    reset({
      ...defaultsFromSchema(safeSchema),
      ...(initialValues || {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by serialized schema/initial
  }, [schemaKey, initialKey, reset]);

  const wide = hasTextarea(safeSchema) && !progressive;
  const entries = Object.entries(safeSchema);
  const longFields = entries.filter(([, d]) => !isParamField(d));
  const paramFields = entries.filter(([, d]) => isParamField(d));
  const { primary, more } = progressive
    ? splitProgressive(entries)
    : { primary: longFields, more: paramFields };

  function renderField(key: string, def: FieldSpec) {
    const label = def.label || key;
    const err = errors[key]?.message as string | undefined;
    const required = Boolean(def.required);
    const fieldId = `ke-input-${key}`;
    const testId = AGENT_TESTID.field(key);
    const reg = register(key, { required });

    if (def.type === "enum" && def.options?.length) {
      return (
        <FormField key={key} label={label} htmlFor={fieldId} error={err}>
          <select
            id={fieldId}
            data-testid={testId}
            className={cn(CONTROL, "h-10")}
            aria-invalid={Boolean(err)}
            {...reg}
          >
            {def.options.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {humanOptionLabel(opt)}
              </option>
            ))}
          </select>
        </FormField>
      );
    }

    if (def.type === "boolean") {
      return (
        <FormField key={key} label={label} htmlFor={fieldId} error={err}>
          <input
            id={fieldId}
            type="checkbox"
            data-testid={testId}
            className="h-4 w-4"
            aria-invalid={Boolean(err)}
            {...register(key)}
          />
        </FormField>
      );
    }

    if (def.type === "number") {
      return (
        <FormField key={key} label={label} htmlFor={fieldId} error={err}>
          <input
            id={fieldId}
            type="number"
            data-testid={testId}
            className={cn(CONTROL, "h-10")}
            min={def.min}
            max={def.max}
            aria-invalid={Boolean(err)}
            {...register(key, { required, valueAsNumber: true })}
          />
        </FormField>
      );
    }

    if (def.type === "file" || def.type === "file[]") {
      return (
        <FormField key={key} label={label} htmlFor={fieldId} error={err}>
          <input
            id={fieldId}
            type="file"
            data-testid={testId}
            multiple={def.type === "file[]"}
            accept={def.accept?.join(",")}
            className="flex h-10 w-full text-sm"
            aria-invalid={Boolean(err)}
            {...reg}
          />
        </FormField>
      );
    }

    if (def.format === "textarea") {
      return (
        <FormField key={key} label={label} htmlFor={fieldId} error={err}>
          <textarea
            id={fieldId}
            data-testid={testId}
            className={cn(
              CONTROL,
              progressive ? "min-h-[88px] py-2" : "min-h-[120px] py-2"
            )}
            maxLength={def.max_length}
            rows={progressive ? 4 : 6}
            aria-invalid={Boolean(err)}
            {...reg}
          />
        </FormField>
      );
    }

    return (
      <FormField key={key} label={label} htmlFor={fieldId} error={err}>
        <input
          id={fieldId}
          data-testid={testId}
          className={cn(CONTROL, "h-10")}
          maxLength={def.max_length}
          aria-invalid={Boolean(err)}
          {...reg}
        />
      </FormField>
    );
  }

  return (
    <form
      data-testid={AGENT_TESTID.form}
      className={cn(
        progressive ? "w-full max-w-none" : wide ? "max-w-3xl" : "max-w-lg",
        "space-y-4"
      )}
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values as Record<string, unknown>);
      })}
    >
      {primary.map(([key, def]) => renderField(key, def))}

      {progressive && more.length > 0 ? (
        <div className="space-y-3">
          <button
            type="button"
            data-testid={AGENT_TESTID.moreParams}
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showMore ? "rotate-0" : "-rotate-90"
              )}
            />
            更多
            <span className="tabular-nums text-muted-foreground/80">
              ({more.length})
            </span>
          </button>
          {showMore ? (
            <div className="space-y-3 border-l-2 border-border/70 pl-3">
              {more.map(([key, def]) => renderField(key, def))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!progressive && paramFields.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {paramFields.map(([key, def]) => renderField(key, def))}
        </div>
      ) : null}

      <Button
        type="submit"
        data-testid={AGENT_TESTID.taskSubmit}
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
