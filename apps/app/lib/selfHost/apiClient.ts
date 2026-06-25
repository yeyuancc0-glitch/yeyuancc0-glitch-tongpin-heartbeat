import { selfHostApiUrl } from "./config";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  accessToken?: string | null;
  body?: unknown;
  query?: Record<string, string | number | null | undefined>;
};

export class SelfHostApiError extends Error {
  code: string;
  status: number;
  requestId?: string;

  constructor({ code, message, requestId, status }: { code: string; message: string; requestId?: string; status: number }) {
    super(message);
    this.name = "SelfHostApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export function buildSelfHostUrl(path: string, query?: RequestOptions["query"]) {
  if (!selfHostApiUrl) {
    throw new SelfHostApiError({
      code: "self_host_not_configured",
      message: "Self-host API URL is not configured.",
      status: 500,
    });
  }

  const url = new URL(path, `${selfHostApiUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function selfHostRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildSelfHostUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new SelfHostApiError({
      code: json?.error?.code ?? "self_host_request_failed",
      message: json?.error?.message ?? `Request failed with status ${response.status}.`,
      requestId: json?.requestId,
      status: response.status,
    });
  }

  return json as T;
}
