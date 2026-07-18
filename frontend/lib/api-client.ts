import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Browser: same-origin /backend/* (Next rewrite -> FastAPI) to avoid CORS / Failed to fetch.
 * Server: talk to FastAPI directly.
 */
function apiBase(): string {
  if (typeof window !== "undefined") {
    return "/backend";
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
};

function extractErrorMessage(errBody: unknown, fallback: string): string {
  if (typeof errBody === "string" && errBody.trim()) return errBody;
  if (typeof errBody !== "object" || !errBody) return fallback;
  const o = errBody as Record<string, unknown>;
  if ("detail" in o) {
    const d = o.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((x) =>
          typeof x === "object" && x && "msg" in x
            ? String((x as { msg: unknown }).msg)
            : JSON.stringify(x)
        )
        .join("; ");
    }
  }
  if (
    typeof o.error === "object" &&
    o.error &&
    "message" in (o.error as object)
  ) {
    return String((o.error as { message: unknown }).message);
  }
  if (typeof o.message === "string") return o.message;
  return fallback;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers: extra, ...rest } = options;
  const headers = new Headers(extra);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = useAuthStore.getState().token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const base = apiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(
      0,
      `网络错误：无法连接 ${url}。请确认后端已启动（:8000）。（${(err as Error).message}）`
    );
  }

  if (!res.ok) {
    let errBody: unknown;
    try {
      errBody = await res.json();
    } catch {
      errBody = await res.text();
    }
    throw new ApiError(
      res.status,
      extractErrorMessage(errBody, res.statusText || `HTTP ${res.status}`),
      errBody
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
