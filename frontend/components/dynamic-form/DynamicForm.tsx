"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import type { FieldSpec, ModuleManifest } from "@/types/module";
import { cn } from "@/lib/utils";

type Props = {
  schema: ModuleManifest["input_schema"];
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
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

/** Auto-render form from MODULE_SPEC.md §3 / §9 */
export function DynamicForm({ schema, onSubmit, submitLabel = "Submit" }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: defaultsFromSchema(schema),
  });

  const wide = hasTextarea(schema);
  const entries = Object.entries(schema);
  const longFields = entries.filter(([, d]) => !isParamField(d));
  const paramFields = entries.filter(([, d]) => isParamField(d));

  function renderField(key: string, def: FieldSpec) {
    const label = def.label || key;
    const err = errors[key]?.message as string | undefined;
    const required = Boolean(def.required);
    const desc = def.description;

    if (def.type === "enum" && def.options?.length) {
      return (
        <FormField key={key} label={label} description={desc} error={err}>
          <select
            className={cn(CONTROL, "h-10")}
            {...register(key, { required })}
          >
            {def.options.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {String(opt)}
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
            className={cn(CONTROL, "min-h-[120px] py-2")}
            maxLength={def.max_length}
            rows={6}
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
      className={cn(wide ? "max-w-3xl" : "max-w-lg", "space-y-4")}
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values as Record<string, unknown>);
      })}
    >
      {longFields.map(([key, def]) => renderField(key, def))}
      {paramFields.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {paramFields.map(([key, def]) => renderField(key, def))}
        </div>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
