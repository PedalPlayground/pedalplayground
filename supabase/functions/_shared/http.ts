import { HttpError } from "./clients.ts";

/** ALLOWED_ORIGINS is a comma-separated list, e.g. "https://pedalplayground.com,http://localhost:5173". */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("SITE_URL") ?? "").split(",").map((s) => s.trim());
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Wraps a handler with CORS, preflight, and consistent error responses. */
export function handler(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return json(await fn(req), 200, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error(e);
      return json({ error: "Something went wrong. Try again." }, 500, cors);
    }
  };
}
