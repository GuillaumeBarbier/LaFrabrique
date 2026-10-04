import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as getSharedAsset } from "@/app/api/share/[token]/assets/[assetId]/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/v1/books/[bookId]/shares/route";
import { storeImage } from "../assets";
import { createApiKey } from "../auth/api-keys";
import { getDb, openDatabase, setDbForTests } from "../db";
import type { Actor } from "../http";
import { listActivity } from "./activity";
import { createBook, setCover, setIllustration, updateBook, updateSpread } from "./books";
import { addCharacterImage, createCharacter } from "./characters";
import { createShare, listShares, recordView, revokeShare, sharedAssetAllowed, sharedBook } from "./shares";

const human: Actor = { type: "human", name: "Guillaume", scope: "owner" };
const ORIGIN = "https://lafabrique.test";

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-"));
  setDbForTests(openDatabase(":memory:"));
});

async function png(color: string) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer();
}

async function sharedFixture() {
  const book = createBook({ title: "La grande vague", spreadCount: 2 }, human);
  updateBook(book.id, { brief: "Secret d'atelier." }, human);
  const spread = book.spreads[0]!;
  updateSpread(book.id, spread.id, { text: "Mama regarde la mer.", illustrationBrief: "Prompt interne", notes: "à revoir" }, human);
  const illustration = await storeImage(await png("#f2c14e"), { kind: "illustration", bookId: book.id, actor: human });
  const cover = await storeImage(await png("#7ab8d9"), { kind: "cover", bookId: book.id, actor: human });
  setIllustration(book.id, spread.id, illustration, human);
  setCover(book.id, cover, human);
  const victoire = createCharacter({ bookId: book.id }, { name: "Victoire" }, human);
  const reference = await storeImage(await png("#c8553d"), { kind: "character", bookId: book.id, actor: human });
  addCharacterImage(victoire.id, reference, { label: "face" }, human);
  const share = createShare(book.id, { label: "Mamie", expiresInDays: 30 }, human, ORIGIN);
  const token = share.url!.split("/").pop()!;
  return { book, share, token, illustration, cover, reference };
}

describe("reading links", () => {
  it("show the pages and nothing of the workshop", async () => {
    const { share, token, illustration } = await sharedFixture();
    expect(share.url).toMatch(/^https:\/\/lafabrique\.test\/lire\/[A-Za-z0-9_-]{32}$/);
    const shared = sharedBook(token)!;
    expect(shared.book.title).toBe("La grande vague");
    expect(shared.book.spreads[0]).toMatchObject({ text: "Mama regarde la mer.", illustrationBrief: "" });
    expect(shared.book.spreads[0]?.illustration?.webUrl).toBe(`/api/share/${token}/assets/${illustration.id}?size=web`);
    expect(shared.book.spreads[0]?.illustration?.printUrl).not.toContain("print");
    const json = JSON.stringify(shared);
    for (const secret of ["Secret d'atelier", "Prompt interne", "à revoir", "Victoire", "Guillaume"]) expect(json).not.toContain(secret);
  });

  it("serve only the book's cover and illustrations, at screen size", async () => {
    const { token, illustration, cover, reference } = await sharedFixture();
    expect(sharedAssetAllowed(token, illustration.id)).toBe(true);
    expect(sharedAssetAllowed(token, cover.id)).toBe(true);
    expect(sharedAssetAllowed(token, reference.id)).toBe(false);
    const res = await getSharedAsset(new Request(`http://x/api/share/${token}/assets/${illustration.id}?size=original`), {
      params: Promise.resolve({ token, assetId: illustration.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const refused = await getSharedAsset(new Request("http://x"), { params: Promise.resolve({ token, assetId: reference.id }) });
    expect(refused.status).toBe(404);
  });

  it("stop working when revoked or expired, and count their readings", async () => {
    const { book, share, token, illustration } = await sharedFixture();
    recordView(token);
    recordView(token);
    expect(listShares(book.id, ORIGIN)[0]).toMatchObject({ viewCount: 2, label: "Mamie", expired: false });

    getDb().prepare("UPDATE shares SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), share.id);
    expect(sharedBook(token)).toBeNull();
    expect(listShares(book.id, ORIGIN)[0]?.expired).toBe(true);

    const other = createShare(book.id, {}, human, ORIGIN);
    const otherToken = other.url!.split("/").pop()!;
    expect(other.expiresAt).toBeNull();
    expect(sharedBook(otherToken)).not.toBeNull();
    revokeShare(other.id, human);
    expect(sharedBook(otherToken)).toBeNull();
    expect(sharedAssetAllowed(otherToken, illustration.id)).toBe(false);
    expect(listActivity({ bookId: book.id }).map((a) => a.summary)).toEqual(
      expect.arrayContaining(["lien de lecture créé (Mamie)", "lien de lecture révoqué"]),
    );
    expect(sharedBook("not-a-token")).toBeNull();
  });

  it("are handed out by the human only; agents see who reads, not the links", async () => {
    const { book } = await sharedFixture();
    const { key } = createApiKey("Claude", "write");
    const auth = { headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } };
    const params = { params: Promise.resolve({ bookId: book.id }) };
    const refused = await createRoute(new Request(`http://x/api/v1/books/${book.id}/shares`, { method: "POST", body: "{}", ...auth }), params);
    expect(refused.status).toBe(403);
    const listed = (await (await listRoute(new Request(`http://x/api/v1/books/${book.id}/shares`, auth), params)).json()) as { shares: { url?: string; label: string }[] };
    expect(listed.shares).toHaveLength(1);
    expect(listed.shares[0]).toMatchObject({ label: "Mamie" });
    expect(listed.shares[0]?.url).toBeUndefined();
  });
});
