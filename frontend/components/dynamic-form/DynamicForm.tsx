"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import type { FieldSpec, ModuleManifest } from "@/types/module";

type Props = {
  schema: ModuleManifest["input_schema"];
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
};

function defaultsFromSchema(schema: Record<string, FieldSpec>) {
  return Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [
      k,
      v.default ?? (v.type === "boolean" ? false : ""),
    ])
  );
}

/** Auto-render form from MODULE_SPEC.md section 3 input_schema */
export function DynamicForm({ schema, onSubmit, submitLabel = "Submit" }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: defaultsFromSchema(schema),
  });

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values as Record<string, unknown>);
      })}
    >
      {Object.entries(schema).map(([key, def]) => {
        const label = def.label || key;
        const err = errors[key]?.message as string | undefined;
        const required = Boolean(def.required);

        if (def.type === "enum" && def.options?.length) {
          return (
            <FormField key={key} label={label} error={err}>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <FormField key={key} label={label} error={err}>
              <input type="checkbox" className="h-4 w-4" {...register(key)} />
            </FormField>
          );
        }

        if (def.type === "number") {
          return (
            <FormField key={key} label={label} error={err}>
              <input
                type="number"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                min={def.min}
                max={def.max}
                {...register(key, { required, valueAsNumber: true })}
              />
            </FormField>
          );
        }

        if (def.type === "file" || def.type === "file[]") {
          return (
            <FormField key={key} label={label} error={err}>
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

        return (
          <FormField key={key} label={label} error={err}>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              maxLength={def.max_length}
              {...register(key, { required })}
            />
          </FormField>
        );
      })}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
