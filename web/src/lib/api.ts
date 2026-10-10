import { accessToken } from "./auth";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export interface Problem {
  blank: string;
  message: string;
}

/** An error the API explained. `message` is written for the person; show it as it is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
    readonly problems: Problem[] = [],
  ) {
    super(message);
  }
}

const OFFLINE = "We couldn't reach Vaada. Check your connection and try again.";

async function parse(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (response.status === 204) return null;
  if (type.includes("application/json")) return response.json();
  return response.text();
}

export async function request<T>(method: string, path: string, body?: unknown, init: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) {
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.warn("request failed", method, path, error);
    throw new ApiError(0, "offline", OFFLINE);
  }
  const data = await parse(response);
  if (!response.ok) {
    const payload = (typeof data === "object" && data ? data : {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      String(payload.error ?? "error"),
      String(payload.message ?? "Something went wrong. Try again."),
      (payload.field as string | null | undefined) ?? null,
      (payload.problems as Problem[] | undefined) ?? [],
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export async function download(path: string, filename: string): Promise<void> {
  const token = await accessToken();
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(response.status, "download", "That download didn't work. Try again.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking at once can cancel the download in some browsers; a minute later the file is long saved.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
