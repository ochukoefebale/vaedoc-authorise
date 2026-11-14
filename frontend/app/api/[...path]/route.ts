import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((p) => !/^[-a-zA-Z0-9_]+$/.test(p)))
    return Response.json({ error: "Invalid API path." }, { status: 400 });
  const base = process.env.API_BASE_URL;
  if (!base)
    return Response.json(
      { error: "The backend connection has not been configured." },
      { status: 503 },
    );
  const target = new URL(base);
  if (process.env.NODE_ENV === "production" && target.protocol !== "https:")
    return Response.json(
      { error: "The backend requires HTTPS." },
      { status: 503 },
    );
  const headers = new Headers({ Accept: "application/json" });
  // Hosting-issued identity; never accept this header from the browser.
  if (process.env.VERCEL_OIDC_TOKEN)
    headers.set("x-vercel-trusted-oidc-idp-token", process.env.VERCEL_OIDC_TOKEN);
  for (const key of ["content-type", "cookie", "origin", "x-csrf-token"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (process.env.API_PROTECTION_BYPASS_SECRET)
    headers.set(
      "x-vercel-protection-bypass",
      process.env.API_PROTECTION_BYPASS_SECRET,
    );
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
    if (body.byteLength > 120000)
      return Response.json({ error: "Payload too large." }, { status: 413 });
  }
  try {
    const upstream = await fetch(
      `${base.replace(/\/$/, "")}/api/${path.join("/")}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(50000),
      },
    );
    if (upstream.status >= 300 && upstream.status < 400)
      return Response.json(
        { error: "Backend returned an unexpected redirect." },
        { status: 502 },
      );
    const outputHeaders = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    for (const cookie of upstream.headers.getSetCookie())
      outputHeaders.append("Set-Cookie", cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outputHeaders,
    });
  } catch {
    return Response.json(
      { error: "The backend is unavailable. Please retry." },
      { status: 502 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
