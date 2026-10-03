import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export function GET() {
  getDb().prepare("SELECT 1").get();
  return Response.json({ ok: true });
}
