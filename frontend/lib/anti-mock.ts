/** Client-side helpers aligned with backend/core/anti_mock.py */

const MOCK_TOKEN = /(mock|demo|dry[_-]?run|fake|演示|测试模式|假数据|内置文案)/i;

export function isMockFieldKey(key: string): boolean {
  return MOCK_TOKEN.test(key || "");
}

export function stripMockFieldsFromSchema<T extends Record<string, { label?: string; description?: string }>>(
  schema: T
): T {
  const out = { ...schema };
  for (const [key, spec] of Object.entries(schema)) {
    const label = spec?.label || "";
    const desc = spec?.description || "";
    if (MOCK_TOKEN.test(key) || MOCK_TOKEN.test(label) || MOCK_TOKEN.test(desc)) {
      delete out[key];
    }
  }
  return out;
}

export type ShellResultMeta = {
  mock?: boolean;
  mock_signals?: string[];
  fast_completion?: boolean;
  duration_ms?: number | null;
  hints?: string[];
};

export function readShellMeta(
  result: Record<string, unknown> | null | undefined
): ShellResultMeta | null {
  if (!result || typeof result !== "object") return null;
  const ke = result._ke;
  if (!ke || typeof ke !== "object") return null;
  return ke as ShellResultMeta;
}
