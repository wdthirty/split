// Tiny fetch wrapper for client components. Cookies carry auth automatically;
// we keep a token copy in localStorage purely as a visible backup for the user.

export const TOKEN_KEY = "sw_token";

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    credentials: "same-origin",
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      `Request failed (${res.status})`;
    throw new Error(message as string);
  }
  return data as T;
}

export function saveTokenBackup(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* localStorage may be unavailable; cookie still works */
  }
}

export function clearTokenBackup() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
