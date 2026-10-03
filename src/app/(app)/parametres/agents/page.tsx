import type { Metadata } from "next";
import { AGENT_GUIDE } from "@/server/agent-guide";
import { listApiKeys } from "@/server/auth/api-keys";
import { pageOrigin } from "@/server/session";
import { AgentKeys } from "./agent-keys";

export const metadata: Metadata = { title: "Agents IA" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  return <AgentKeys keys={listApiKeys()} origin={await pageOrigin()} guide={AGENT_GUIDE} />;
}
