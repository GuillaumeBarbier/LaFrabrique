import { z } from "zod";
import { authenticateApiKey } from "./auth/api-keys";
import { SESSION_COOKIE, userFromSession } from "./auth/users";
import { badRequest, forbidden, HttpError } from "./util";

export type ActorType = "human" | "agent";

/** Who is acting: the signed-in human, or an agent through its API key (ADR-0002). */
export interface Actor {
  type: ActorType;
  name: string;
  scope: "owner" | "read" | "write";
  userId?: string;
  keyId?: string;
  /** Browser tab id, so a tab can ignore the live events it caused itself. */
  clientId?: string;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function resolveActor(req: Request): Actor | null {
  const clientId = req.headers.get("x-client-id")?.slice(0, 64) || undefined;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const key = authenticateApiKey(auth.slice(7).trim());
    if (!key) return null;
    return { type: "agent", name: key.name, scope: key.scope, keyId: key.id, clientId };
  }
  const user = userFromSession(readCookie(req, SESSION_COOKIE));
  if (!user) return null;
  return { type: "human", name: user.name, scope: "owner", userId: user.id, clientId };
}

export function canWrite(actor: Actor): boolean {
  return actor.scope === "owner" || actor.scope === "write";
}

export function assertWrite(actor: Actor): void {
  if (!canWrite(actor)) throw forbidden("Cette clé est en lecture seule.");
}

export function assertHuman(actor: Actor): void {
  if (actor.type !== "human") throw forbidden("Réservé à l'humain : à faire depuis l'interface.");
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Cookie-authenticated mutations must come from our own pages (CSRF, on top of SameSite=Lax). */
function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Origine invalide.");
  }
  if (host && originHost !== host) throw forbidden("Origine non autorisée.");
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return json(
      { error: { code: "invalid", message: "Données invalides.", details: z.flattenError(err) } },
      { status: 400 },
    );
  }
  console.error(err);
  return json({ error: { code: "internal", message: "Erreur interne." } }, { status: 500 });
}

type Access = "read" | "write" | "human";

interface HandlerArgs<P> {
  req: Request;
  actor: Actor;
  params: P;
}

/**
 * Wraps a route handler: resolves the actor, enforces access, turns errors into JSON.
 * Handlers return either a Response or a JSON-serialisable value.
 */
export function api<P = Record<string, never>>(access: Access, handler: (args: HandlerArgs<P>) => Promise<unknown> | unknown) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const actor = resolveActor(req);
      if (!actor) {
        return json({ error: { code: "unauthorized", message: "Connexion requise (session ou clé API)." } }, { status: 401 });
      }
      if (actor.type === "human" && MUTATING.has(req.method)) assertSameOrigin(req);
      if (access === "write") assertWrite(actor);
      if (access === "human") assertHuman(actor);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler({ req, actor, params });
      if (result instanceof Response) return result;
      if (result === undefined) return new Response(null, { status: 204 });
      return json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Corps JSON attendu.");
  }
  return schema.parse(body);
}

/** Public origin, for the connection instructions shown to agents. */
export function publicOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}
