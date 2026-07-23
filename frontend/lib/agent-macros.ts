/** Acceptance macros for Cursor browser agents — short labels only, no tutorial copy. */

export type AgentMacro = {
  id: string;
  module_id: string;
  label: string;
  input_params: Record<string, unknown>;
  /** If true, submit immediately after applying params */
  auto_run?: boolean;
};

export const AGENT_MACROS: AgentMacro[] = [
  {
    id: "echo-hello",
    module_id: "echo",
    label: "试跑",
    input_params: { message: "hello" },
    auto_run: false,
  },
];

export const AGENT_TESTID = {
  navHome: "ke-nav-home",
  navTasks: "ke-nav-tasks",
  navAssets: "ke-nav-assets",
  taskOpenInput: "ke-task-open-input",
  taskReload: "ke-task-reload",
  taskSubmit: "ke-task-submit",
  taskResult: "ke-task-result",
  taskStatus: "ke-task-status",
  form: "ke-form",
  moreParams: "ke-form-more",
  moduleCard: (id: string) => `ke-module-card-${id}`,
  moduleNav: (id: string) => `ke-module-nav-${id}`,
  field: (name: string) => `ke-field-${name}`,
  taskCard: (id: string) => `ke-task-card-${id}`,
  taskDelete: (id: string) => `ke-task-delete-${id}`,
  macro: (id: string) => `ke-macro-${id}`,
  assetItem: (id: string) => `ke-asset-${id}`,
} as const;

export function macrosForModule(moduleId: string): AgentMacro[] {
  return AGENT_MACROS.filter((m) => m.module_id === moduleId);
}

export function findMacro(macroId: string): AgentMacro | undefined {
  return AGENT_MACROS.find((m) => m.id === macroId);
}
