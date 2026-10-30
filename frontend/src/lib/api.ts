const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ka_token") || "";
}

export function setToken(token: string) {
  localStorage.setItem("ka_token", token);
}

export function clearToken() {
  localStorage.removeItem("ka_token");
}

export async function api<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const timeoutMs = options.body instanceof FormData ? 60_000 : 45_000;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
