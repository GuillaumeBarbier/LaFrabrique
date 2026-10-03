import dns from "node:dns/promises";
import net from "node:net";
import { badRequest, HttpError } from "./util";

// Outbound fetches on behalf of agents or OAuth clients: public https only, never the LAN
// (the NAS sits next to other devices), no redirects, bounded size and time.

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) return PRIVATE_HOST.test(address);
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::1" || lower === "::" || /^f[cd]/.test(lower) || lower.startsWith("fe80");
}

export async function assertPublicHttpsUrl(url: string, what = "Adresse"): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest(`${what} invalide.`);
  }
  if (parsed.protocol !== "https:" || PRIVATE_HOST.test(parsed.hostname)) {
    throw badRequest("Seules les adresses https publiques sont acceptées.");
  }
  // The name could still resolve to a private address: check what it points to.
  const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw badRequest("Seules les adresses https publiques sont acceptées.");
  }
  return parsed;
}

export async function fetchPublic(url: string, opts: { maxBytes: number; timeoutMs: number; what?: string }): Promise<Buffer> {
  const parsed = await assertPublicHttpsUrl(url, opts.what);
  const res = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(opts.timeoutMs) });
  if (!res.ok) throw badRequest(`Téléchargement impossible (${res.status}).`);
  const tooBig = () => new HttpError(413, "too_large", "Fichier trop lourd.");
  if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) throw tooBig();
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > opts.maxBytes) throw tooBig();
  return buffer;
}
