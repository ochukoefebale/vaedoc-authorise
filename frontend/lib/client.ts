let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function apiRequest(path: string, body?: unknown): Promise<any> {
  const res = await fetch(
    "/api" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify(body),
        },
  );
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error("The server returned an unexpected response.");
  }
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("authorise-session-expired"));
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
