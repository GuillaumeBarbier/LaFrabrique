/** Client credentials from the Authorization: Basic header (client_secret_basic), if any. */
export function basicCredentials(req: Request): { id: string; secret: string } | null {
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("basic ")) return null;
  const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  return { id: decodeURIComponent(decoded.slice(0, i)), secret: decodeURIComponent(decoded.slice(i + 1)) };
}

/** OAuth bodies are form-encoded (RFC 6749); JSON is tolerated for lenient clients. */
export async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
