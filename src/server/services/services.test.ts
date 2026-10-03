import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey, createApiKey, revokeApiKey } from "../auth/api-keys";
import { hashPassword, verifyPassword } from "../auth/password";
import { createFirstUser, createSession, userFromSession, verifyCredentials } from "../auth/users";
import { storeImage } from "../assets";
import { openDatabase, setDbForTests } from "../db";
import type { Actor } from "../http";
import { listActivity } from "./activity";
import {
  addSpread,
  createBook,
  deleteBook,
  deleteSpread,
  getBook,
  listBooks,
  reorderSpreads,
  restoreActivity,
  setIllustration,
  updateBook,
  updateBookSchema,
  updateSpread,
} from "./books";
import { createComment, listComments, listOpenRequests, setCommentResolved } from "./comments";
import { deleteFont, detectFontFormat, uploadFont } from "./fonts";

const human: Actor = { type: "human", name: "Guillaume", scope: "owner" };
const agent: Actor = { type: "agent", name: "Claude", scope: "write" };

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-"));
  setDbForTests(openDatabase(":memory:"));
});

describe("auth", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("creates the first account once, then sessions", () => {
    const user = createFirstUser({ email: "g@example.com", name: "Guillaume", password: "un mot de passe" });
    expect(() => createFirstUser({ email: "x@example.com", name: "X", password: "un mot de passe" })).toThrow();
    expect(verifyCredentials("G@example.com", "un mot de passe")?.id).toBe(user.id);
    expect(verifyCredentials("g@example.com", "nope")).toBeNull();
    const { token } = createSession(user.id, null);
    expect(userFromSession(token)?.id).toBe(user.id);
    expect(userFromSession("forged")).toBeNull();
  });

  it("authenticates and revokes API keys", () => {
    const { key, info } = createApiKey("Claude", "write");
    expect(key.startsWith("lfab_")).toBe(true);
    expect(authenticateApiKey(key)?.name).toBe("Claude");
    revokeApiKey(info.id);
    expect(authenticateApiKey(key)).toBeNull();
  });
});

describe("books and spreads", () => {
  it("creates a book with blank spreads and lists it", () => {
    const book = createBook({ title: "Le renard", spreads: 3 }, human);
    expect(book.spreads).toHaveLength(3);
    expect(book.status).toBe("idea");
    const list = listBooks("all");
    expect(list[0]?.spreadCount).toBe(3);
    expect(list[0]?.completeSpreads).toBe(0);
  });

  it("validates typography fonts", () => {
    expect(updateBookSchema.safeParse({ typography: { bodyFont: "andika" } }).success).toBe(true);
    expect(updateBookSchema.safeParse({ typography: { bodyFont: "comic-sans" } }).success).toBe(false);
  });

  it("coalesces edits by the same author and restores the earlier state", () => {
    const book = createBook({ title: "Le renard", spreads: 1 }, human);
    const spread = book.spreads[0]!;
    updateSpread(book.id, spread.id, { text: "Il était une fois" }, agent);
    updateSpread(book.id, spread.id, { text: "Il était une fois un renard", illustrationBrief: "Un renard" }, agent);
    const history = listActivity(book.id, { spreadId: spread.id });
    expect(history).toHaveLength(1);
    expect(history[0]?.summary).toBe("texte, brief d'illustration");
    restoreActivity(history[0]!.id, human);
    const restored = getBook(book.id).spreads[0]!;
    expect(restored.text).toBe("");
    expect(restored.updatedBy.name).toBe("Guillaume");
  });

  it("detects concurrent edits through baseVersion", () => {
    const book = createBook({ title: "Le renard", spreads: 1 }, human);
    const spread = book.spreads[0]!;
    updateSpread(book.id, spread.id, { text: "agent", baseVersion: spread.version }, agent);
    expect(() => updateSpread(book.id, spread.id, { text: "humain", baseVersion: spread.version }, human)).toThrow(/modifiée/);
  });

  it("inserts, reorders, deletes and brings back a spread", () => {
    const book = createBook({ title: "Le renard", spreads: 2 }, human);
    const added = addSpread(book.id, { position: 0, text: "Début" }, agent);
    let ids = getBook(book.id).spreads.map((s) => s.id);
    expect(ids[0]).toBe(added.id);
    reorderSpreads(book.id, [...ids].reverse(), human);
    ids = getBook(book.id).spreads.map((s) => s.id);
    expect(ids[2]).toBe(added.id);
    deleteSpread(book.id, added.id, agent);
    expect(getBook(book.id).spreads).toHaveLength(2);
    const deletion = listActivity(book.id).find((a) => a.action === "spread.delete")!;
    restoreActivity(deletion.id, human);
    const back = getBook(book.id).spreads;
    expect(back.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(back[2]?.text).toBe("Début");
  });

  it("updates status and archives", () => {
    const book = createBook({ title: "Le renard", spreads: 0 }, human);
    updateBook(book.id, { status: "writing", archived: true }, agent);
    expect(listBooks("all")).toHaveLength(0);
    expect(listBooks("archived")[0]?.status).toBe("writing");
  });

  it("stores illustrations with their size and counts complete spreads", async () => {
    const book = createBook({ title: "Le renard", spreads: 1 }, human);
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#ff8800" } }).png().toBuffer();
    const asset = await storeImage(png, { kind: "illustration", bookId: book.id, actor: agent });
    const spread = setIllustration(book.id, book.spreads[0]!.id, asset, agent);
    expect(spread.illustration?.width).toBe(64);
    updateSpread(book.id, spread.id, { text: "Texte" }, human);
    expect(listBooks("all")[0]?.completeSpreads).toBe(1);
    await expect(storeImage(Buffer.from("<svg/>"), { kind: "illustration", bookId: book.id, actor: agent })).rejects.toThrow();
    deleteBook(book.id, human);
    expect(listBooks("all")).toHaveLength(0);
  });
});

describe("comments", () => {
  it("tracks requests to the agent until resolved", () => {
    const book = createBook({ title: "Le renard", spreads: 1 }, human);
    const req = createComment(book.id, { body: "Plus drôle", spreadId: book.spreads[0]!.id, addressedTo: "agent" }, human);
    createComment(book.id, { body: "C'est fait", parentId: req.id }, agent);
    expect(listOpenRequests("agent")).toHaveLength(1);
    expect(listOpenRequests("agent")[0]?.replies).toHaveLength(1);
    expect(getBook(book.id).openRequests.forAgent).toBe(1);
    setCommentResolved(req.id, true, agent);
    expect(listOpenRequests("agent")).toHaveLength(0);
    expect(listComments(book.id, { openOnly: true })).toHaveLength(0);
    expect(listComments(book.id)).toHaveLength(2);
  });
});

describe("fonts", () => {
  it("recognises font files by signature", () => {
    expect(detectFontFormat(Buffer.from("wOF2\0\0\0\0\0\0\0\0", "latin1"))?.format).toBe("woff2");
    expect(detectFontFormat(Buffer.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.format).toBe("truetype");
    expect(detectFontFormat(Buffer.from("<html>hello</html>"))).toBeNull();
  });

  it("refuses to delete a font in use", () => {
    const font = uploadFont(Buffer.from("OTTO\0\0\0\0\0\0\0\0", "latin1"), "Ma-Police.otf", null, human);
    expect(font.name).toBe("Ma Police");
    const book = createBook({ title: "Le renard", spreads: 0 }, human);
    updateBook(book.id, { typography: { bodyFont: font.key } }, human);
    expect(() => deleteFont(font.id)).toThrow(/utilisée/);
    updateBook(book.id, { typography: { bodyFont: "andika" } }, human);
    deleteFont(font.id);
  });
});
