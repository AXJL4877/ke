"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import type { FieldSpec, ModuleManifest } from "@/types/module";
import { stripMockFieldsFromSchema } from "@/lib/anti-mock";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Props = {
  schema: ModuleManifest["input_schema"];
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
  /** Compact sidebar: primary fields first, optional params behind a toggle */
  progressive?: boolean;
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
  const longFields = entries.filter(([, d]) => !isParamField(d));
  const paramFields = entries.filter(([, d]) => isParamField(d));

  // Required / main content fields stay visible
  const primary = longFields.filter(
    ([, d]) =>
      d.required ||
      d.format === "textarea" ||
      d.type === "file" ||
      d.type === "file[]" ||
      d.type === "string"
  );
  const shown =
    primary.length > 0
      ? primary
      : longFields.length > 0
        ? [longFields[0]]
        : entries.slice(0, 1);
  const shownKeys = new Set(shown.map(([k]) => k));
  const more = [
    ...longFields.filter(([k]) => !shownKeys.has(k)),
    ...paramFields.filter(([k]) => !shownKeys.has(k)),
  ];
  return { primary: shown, more };
}

/** Auto-render form from MODULE_SPEC.md §3 / §9 */
export function DynamicForm({
  schema,
  onSubmit,
  submitLabel = "Submit",
  progressive = false,
}: Props) {
  const safeSchema = stripMockFieldsFromSchema(schema);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: defaultsFromSchema(safeSchema),
  });
  const [showMore, setShowMore] = useState(false);

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
    const desc = undefined;

    if (def.type === "enum" && def.options?.length) {
      return (
        <FormField key={key} label={label} description={desc} error={err}>
          <select
            className={cn(CONTROL, "h-10")}
            {...register(key, { required })}
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
        <FormField key={key} label={label} description={desc} error={err}>
          <input type="checkbox" className="h-4 w-4" {...register(key)} />
        </FormField>
      );
    }

    if (def.type === "number") {
      return (
        <FormField key={key} label={label} description={desc} error={err}>
          <input
            type="number"
            className={cn(CONTROL, "h-10")}
            min={def.min}
            max={def.max}
            {...register(key, { required, valueAsNumber: true })}
          />
        </FormField>
      );
    }

    if (def.type === "file" || def.type === "file[]") {
      return (
        <FormField key={key} label={label} description={desc} error={err}>
          <input
            type="file"
            multiple={def.type === "file[]"}
            accept={def.accept?.join(",")}
            className="flex h-10 w-full text-sm"
            {...register(key, { required })}
          />
        </FormField>
      );
    }

    if (def.format === "textarea") {
      return (
        <FormField key={key} label={label} description={desc} error={err}>
          <textarea
            className={cn(CONTROL, progressive ? "min-h-[88px] py-2" : "min-h-[120px] py-2")}
            maxLength={def.max_length}
            rows={progressive ? 4 : 6}
            {...register(key, { required })}
          />
        </FormField>
      );
    }

    return (
      <FormField key={key} label={label} description={desc} error={err}>
        <input
          className={cn(CONTROL, "h-10")}
          maxLength={def.max_length}
          {...register(key, { required })}
        />
      </FormField>
    );
  }

  return (
    <form
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
            onClick={() => setShowMore((v) => !v)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showMore ? "rotate-0" : "-rotate-90"
              )}
            />
            更多参数
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

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
