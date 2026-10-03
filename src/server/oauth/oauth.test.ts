import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, setDbForTests } from "../db";
import { resolveActor } from "../http";
import { isAcceptableRedirectUri, redirectUriMatches, registerClient } from "./clients";
import { OAuthError } from "./errors";
import {
  actorFromAccessToken,
  approveAuthorization,
  exchangeToken,
  listConnections,
  revokeConnection,
  validateAuthorizationRequest,
} from "./flow";

const ORIGIN = "https://lafabrique.test";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-"));
  setDbForTests(openDatabase(":memory:"));
});

function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url") };
}

async function authorize(clientId: string, redirectUri = CALLBACK, extra: Record<string, string> = {}) {
  const { verifier, challenge } = pkce();
  const result = await validateAuthorizationRequest(
    {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "xyz",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: `${ORIGIN}/api/mcp`,
      scope: "read write",
      ...extra,
    },
    ORIGIN,
  );
  if (!result.ok) throw new Error(result.description);
  const url = new URL(approveAuthorization(result.request, { name: "Claude illustrateur", scope: "write" }));
  return { code: url.searchParams.get("code") as string, state: url.searchParams.get("state"), verifier, redirectUri };
}

describe("redirect URIs", () => {
  it("match exactly, or on loopback whatever the port", () => {
    expect(redirectUriMatches(CALLBACK, CALLBACK)).toBe(true);
    expect(redirectUriMatches(CALLBACK, "https://claude.ai/api/mcp/other")).toBe(false);
    expect(redirectUriMatches("http://localhost/callback", "http://localhost:3118/callback")).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1/callback", "http://127.0.0.1:50000/callback")).toBe(true);
    expect(redirectUriMatches("http://localhost/callback", "http://127.0.0.1:3118/callback")).toBe(false);
    expect(redirectUriMatches("http://localhost/callback", "http://localhost:3118/other")).toBe(false);
    expect(isAcceptableRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAcceptableRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
  });
});

describe("authorization code flow (DCR)", () => {
  it("issues tokens bound to the MCP endpoint and rotates refresh tokens", async () => {
    const client = registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    const { code, state, verifier } = await authorize(client.client_id);
    expect(state).toBe("xyz");

    expect(() =>
      exchangeToken({ grantType: "authorization_code", code, redirectUri: CALLBACK, codeVerifier: "x".repeat(43), clientId: client.client_id }),
    ).toThrow(/code_verifier/);

    // the failed attempt above did not consume the code
    const tokens = exchangeToken({
      grantType: "authorization_code",
      code,
      redirectUri: CALLBACK,
      codeVerifier: verifier,
      clientId: client.client_id,
      resource: `${ORIGIN}/api/mcp`,
    });
    expect(tokens.token_type).toBe("Bearer");
    expect(actorFromAccessToken(tokens.access_token)).toMatchObject({ type: "agent", name: "Claude illustrateur", scope: "write" });

    // audience: the token opens the MCP endpoint, not the REST API
    const bearer = { authorization: `Bearer ${tokens.access_token}` };
    expect(resolveActor(new Request(`${ORIGIN}/api/mcp`, { headers: bearer }))?.name).toBe("Claude illustrateur");
    expect(resolveActor(new Request(`${ORIGIN}/api/v1/books`, { headers: bearer }))).toBeNull();

    const next = exchangeToken({ grantType: "refresh_token", refreshToken: tokens.refresh_token, clientId: client.client_id });
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    // replaying the old refresh token: theft suspected, the connection is revoked
    expect(() => exchangeToken({ grantType: "refresh_token", refreshToken: tokens.refresh_token, clientId: client.client_id })).toThrow(
      OAuthError,
    );
    expect(actorFromAccessToken(next.access_token)).toBeNull();
    expect(listConnections()[0]?.revokedAt).not.toBeNull();
  });

  it("refuses a replayed code and revokes what it produced", async () => {
    const client = registerClient({ redirect_uris: [CALLBACK] });
    const { code, verifier } = await authorize(client.client_id);
    const tokens = exchangeToken({ grantType: "authorization_code", code, redirectUri: CALLBACK, codeVerifier: verifier, clientId: client.client_id });
    expect(() =>
      exchangeToken({ grantType: "authorization_code", code, redirectUri: CALLBACK, codeVerifier: verifier, clientId: client.client_id }),
    ).toThrow(/déjà utilisé/);
    expect(actorFromAccessToken(tokens.access_token)).toBeNull();
  });

  it("requires the secret of a confidential client", async () => {
    const client = registerClient({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_post" });
    const { code, verifier } = await authorize(client.client_id);
    const base = { grantType: "authorization_code", code, redirectUri: CALLBACK, codeVerifier: verifier, clientId: client.client_id };
    expect(() => exchangeToken({ ...base, clientSecret: "wrong" })).toThrow(/Secret/);
    expect(exchangeToken({ ...base, clientSecret: client.client_secret }).access_token).toMatch(/^lfat_/);
  });

  it("revokes a connection from the settings", async () => {
    const client = registerClient({ redirect_uris: ["http://localhost/callback"] });
    const { code, verifier, redirectUri } = await authorize(client.client_id, "http://localhost:4567/callback");
    const tokens = exchangeToken({ grantType: "authorization_code", code, redirectUri, codeVerifier: verifier, clientId: client.client_id });
    const [connection] = listConnections();
    expect(connection?.redirectHost).toBe("localhost:4567");
    revokeConnection(connection!.id);
    expect(actorFromAccessToken(tokens.access_token)).toBeNull();
  });
});

describe("authorization request validation", () => {
  it("never redirects to an unregistered address, redirects other errors", async () => {
    const client = registerClient({ redirect_uris: [CALLBACK] });
    const { challenge } = pkce();
    const base = { response_type: "code", client_id: client.client_id, code_challenge: challenge, code_challenge_method: "S256" };
    const evil = await validateAuthorizationRequest({ ...base, redirect_uri: "https://evil.example/cb" }, ORIGIN);
    expect(evil.ok).toBe(false);
    expect(!evil.ok && evil.redirect).toBeUndefined();

    const noPkce = await validateAuthorizationRequest({ ...base, redirect_uri: CALLBACK, code_challenge_method: "plain" }, ORIGIN);
    expect(!noPkce.ok && noPkce.redirect).toMatch(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request/);

    const otherResource = await validateAuthorizationRequest({ ...base, redirect_uri: CALLBACK, resource: "https://other.example/mcp" }, ORIGIN);
    expect(!otherResource.ok && otherResource.redirect).toMatch(/error=invalid_target/);

    const readOnly = await validateAuthorizationRequest({ ...base, redirect_uri: CALLBACK, scope: "read" }, ORIGIN);
    expect(readOnly.ok && readOnly.request.requestedScope).toBe("read");
  });

  it("identifies a client by its metadata document (CIMD)", async () => {
    const url = "https://claude.ai/oauth/claude-code-client-metadata";
    const doc = { client_id: url, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], token_endpoint_auth_method: "none" };
    const { challenge } = pkce();
    const params = {
      response_type: "code",
      client_id: url,
      redirect_uri: "http://127.0.0.1:61000/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    const ok = await validateAuthorizationRequest(params, ORIGIN, async () => doc);
    expect(ok.ok && ok.client.name).toBe("Claude Code");
    const forged = await validateAuthorizationRequest(
      { ...params, client_id: "https://evil.example/client.json" },
      ORIGIN,
      async () => ({ ...doc, client_id: url }),
    );
    expect(forged.ok).toBe(false);
  });
});
