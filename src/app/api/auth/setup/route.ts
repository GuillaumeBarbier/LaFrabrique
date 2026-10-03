import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createFirstUser, createSession, hasAnyUser, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/server/auth/users";
import { errorResponse, isSecureRequest, parseJson } from "@/server/http";
import { forbidden, HttpError } from "@/server/util";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  setupToken: z.string().max(200).optional(),
});

/** First launch only: creates the owner account, then signs in. */
export async function POST(req: Request) {
  try {
    if (hasAnyUser()) throw new HttpError(409, "already_setup", "Le compte existe déjà.");
    const input = await parseJson(req, schema);
    const expected = process.env.SETUP_TOKEN;
    if (expected) {
      const given = Buffer.from(input.setupToken ?? "");
      const want = Buffer.from(expected);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw forbidden("Code d'installation incorrect.");
    }
    const user = createFirstUser(input);
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
