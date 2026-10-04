import type { Metadata } from "next";
import { agentGuide } from "@/server/agent-guide";
import { listApiKeys } from "@/server/auth/api-keys";
import { listConnections } from "@/server/oauth/flow";
import { pageOrigin } from "@/server/session";
import { AgentKeys } from "./agent-keys";

export const metadata: Metadata = { title: "Agents IA" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const origin = await pageOrigin();
  return <AgentKeys keys={listApiKeys()} connections={listConnections()} origin={origin} guide={agentGuide(origin)} />;
}
