import { api } from "@/server/http";
import { listConnections } from "@/server/oauth/flow";

/** Connections made through OAuth (claude.ai…): one per consented agent. */
export const GET = api("human", () => ({ connections: listConnections() }));
