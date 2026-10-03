import type { Metadata } from "next";
import { listOpenRequests } from "@/server/services/comments";
import { Inbox } from "./inbox";

export const metadata: Metadata = { title: "Échanges" };
export const dynamic = "force-dynamic";

export default function ExchangesPage() {
  return <Inbox forHuman={listOpenRequests("human")} forAgent={listOpenRequests("agent")} />;
}
