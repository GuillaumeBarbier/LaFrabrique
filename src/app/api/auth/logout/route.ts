import { NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/server/auth/users";

export async function POST(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (token) deleteSession(decodeURIComponent(token));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
