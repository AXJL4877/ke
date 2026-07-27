/**
 * Auto-generated from backend OpenAPI. Do not edit by hand.
 * Run: npm run gen-types
 */
export interface paths {
  "/api/auth/login": {
    post: {
      requestBody: {
        content: {
          "application/json": {
            username: string;
            password: string;
          };
        };
      };
      responses: {
        200: {
          content: {
            "application/json": {
              access_token: string;
              token_type: string;
              user: { id: string; username: string };
            };
          };
        };
      };
    };
  };
  "/api/modules": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["ModuleManifest"][];
          };
        };
      };
    };
  };
  "/api/tasks": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["Task"][];
          };
        };
      };
    };
    post: {
      requestBody: {
        content: {
          "application/json": components["schemas"]["TaskCreate"];
        };
      };
      responses: {
        201: {
          content: {
            "application/json": components["schemas"]["Task"];
          };
        };
      };
    };
  };
}

export interface components {
  schemas: {
    ModuleManifest: {
      id: string;
      name: string;
      description: string;
      version: string | number;
      category: string;
      input_schema: Record<string, unknown>;
      output_schema: Record<string, unknown>;
      ui_hint?: Record<string, unknown>;
      runtime: Record<string, unknown>;
    };
    TaskCreate: {
      module_id: string;
      input_params: Record<string, unknown>;
    };
    Task: {
      id: string;
      module_id: string;
      input_params: Record<string, unknown>;
      status: "pending" | "processing" | "done" | "failed";
      result: Record<string, unknown> | null;
      error_message: string | null;
      progress?: number | null;
      progress_message?: string | null;
      progress_stage?: string | null;
      created_at: string;
      updated_at: string;
    };
  };
}
