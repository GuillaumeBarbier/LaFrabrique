import { NextResponse } from "next/server";
import { z } from "zod";
import { clearHits, isRateLimited, recordHit } from "@/server/auth/rate-limit";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifyCredentials } from "@/server/auth/users";
import { errorResponse, isSecureRequest, parseJson } from "@/server/http";
import { HttpError } from "@/server/util";

const schema = z.object({ email: z.string().max(200), password: z.string().max(200) });

const LIMIT = 8;
const WINDOW_MS = 15 * 60_000;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: Request) {
  try {
    const ip = `login:${clientIp(req)}`;
    if (isRateLimited(ip, LIMIT, WINDOW_MS)) {
      throw new HttpError(429, "rate_limited", "Trop d'essais. Réessayer dans un quart d'heure.");
    }
    const input = await parseJson(req, schema);
    const user = verifyCredentials(input.email, input.password);
    if (!user) {
      recordHit(ip);
      throw new HttpError(401, "invalid_credentials", "E-mail ou mot de passe incorrect.");
    }
    clearHits(ip);
    const { token } = createSession(user.id, req.headers.get("user-agent"));
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(req),
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
