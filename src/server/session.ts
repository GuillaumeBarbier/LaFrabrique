import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasAnyUser, SESSION_COOKIE, type User, userFromSession } from "./auth/users";
import type { Actor } from "./http";

export async function currentUser(): Promise<User | null> {
  return userFromSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages: the signed-in human, or a redirect to sign-in (or to setup on first launch). */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(hasAnyUser() ? "/connexion" : "/installation");
  return user;
}

export function humanActor(user: User): Actor {
  return { type: "human", name: user.name, scope: "owner", userId: user.id };
}

/** Public origin for pages (connection instructions): APP_URL, else the request's host. */
export async function pageOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
