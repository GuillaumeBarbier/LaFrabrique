import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { inferView } from "@/lib/views";
import { lintText, mergeRules, writingGuide } from "@/lib/writing";
import { openDatabase, setDbForTests } from "./db";
import type { Actor } from "./http";
import { buildMcpServer } from "./mcp";
import { receiveUpload } from "./services/uploads";

const agent: Actor = { type: "agent", name: "Claude", scope: "write" };

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-"));
  setDbForTests(openDatabase(":memory:"));
});

async function connect(actor: Actor = agent) {
  const server = buildMcpServer(actor, "https://lafabrique.test");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  return {
    client,
    async call(name: string, args: Record<string, unknown> = {}) {
      const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string; mimeType?: string }[]; isError?: boolean };
      const first = res.content[0];
      let json: Record<string, unknown> | null = null;
      try {
        json = first?.type === "text" ? (JSON.parse(first.text as string) as Record<string, unknown>) : null;
      } catch {
        // Validation errors from the SDK are plain text.
      }
      return { ...res, json, raw: first?.text ?? "" };
    },
  };
}

describe("MCP tools", () => {
  it("speak snake_case and reject unknown parameters with the expected name", async () => {
    const { call, client } = await connect();
    const created = await call("create_book", { title: "Victoire", age_min: 3, age_max: 6, spread_count: 2 });
    expect(created.isError).toBeFalsy();
    const bookId = created.json?.id as string;
    expect(created.json?.spread_ids).toHaveLength(2);

    const book = await call("get_book", { book_id: bookId, include: ["spreads"], summary: true });
    expect(book.json).toMatchObject({ age_min: 3, age_max: 6, spread_count: 2 });
    expect((book.json?.spreads as unknown[])[0]).toMatchObject({ illustration: "none", word_count: 0 });
    expect(book.json?.brief).toBeUndefined();

    const wrong = await call("update_book", { book_id: bookId, ageMin: 4, title: "X" });
    expect(wrong.isError).toBe(true);
    expect(wrong.raw).toContain("ageMin (→ age_min)");
    const nested = await call("update_book", { book_id: bookId, typography: { titleFont: "nunito" } });
    expect(nested.raw).toContain("titleFont (→ title_font)");

    const tools = (await client.listTools()).tools;
    const createBook = tools.find((t) => t.name === "create_book")!;
    expect(createBook.inputSchema.additionalProperties).toBe(false);
    expect(Object.keys(createBook.inputSchema.properties ?? {})).toContain("spread_count");
    expect(tools.every((t) => Object.keys(t.inputSchema.properties ?? {}).every((k) => k === k.toLowerCase()))).toBe(true);
  });

  it("answer writes briefly unless verbose", async () => {
    const { call } = await connect();
    const bookId = (await call("create_book", { title: "Victoire", spread_count: 1 })).json?.id as string;
    const updated = await call("update_book", { book_id: bookId, brief: "Deux sœurs.", age_min: 3 });
    expect(updated.json).toEqual({ id: bookId, version: 2, changed: ["age_min", "brief"] });
    expect(updated.raw.length).toBeLessThan(80);

    const c = await call("create_character", { book_id: bookId, name: "Mama", appearance: "cheveux bruns" });
    const characterId = c.json?.id as string;
    const edit = await call("update_character", { character_id: characterId, role: "la maman" });
    expect(edit.json).toEqual({ id: characterId, name: "Mama", image_count: 0, changed: ["role"] });
    const full = await call("update_character", { character_id: characterId, role: "la maman", verbose: true });
    expect(full.json).toMatchObject({ appearance: "cheveux bruns", changed: [] });
  });

  it("upload a local file end to end: create_upload, PUT, commit_upload", async () => {
    const { call } = await connect();
    const bookId = (await call("create_book", { title: "Victoire", spread_count: 1 })).json?.id as string;
    const tickets = await call("create_upload", { book_id: bookId, kind: "image", files: [{ filename: "mama-face.png", label: "face" }, { filename: "mama-dos.png", label: "dos" }] });
    const uploads = tickets.json?.uploads as { upload_id: string; upload_url: string; curl: string }[];
    expect(uploads[0]?.curl).toMatch(/^curl -sS --fail-with-body -T 'mama-face\.png' 'https:\/\/lafabrique\.test\/api\/v1\/uploads\//);
    const png = await sharp({ create: { width: 600, height: 1100, channels: 3, background: "#884422" } }).png().toBuffer();
    for (const u of uploads) await receiveUpload(u.upload_id, new URL(u.upload_url).searchParams.get("token"), async () => png);

    const committed = await call("commit_upload", { upload_ids: uploads.map((u) => u.upload_id) });
    expect((committed.json?.results as { status: string }[]).map((r) => r.status)).toEqual(["ready", "ready"]);

    const created = await call("create_character", { book_id: bookId, name: "Mama", images: uploads.map((u) => ({ upload_id: u.upload_id })) });
    expect(created.json).toMatchObject({ name: "Mama", image_count: 2 });
    const refs = await call("get_references", { book_id: bookId, images: "none" });
    expect((refs.json?.characters as { by_view: Record<string, string[]> }[])[0]?.by_view).toMatchObject({ front: expect.any(Array), back: expect.any(Array) });

    const again = await call("create_character", { book_id: bookId, name: "Bis", images: [{ upload_id: uploads[0]!.upload_id }] });
    expect(again.isError).toBe(true);
    expect(again.raw).toContain("déjà utilisé");

    const sheet = await call("view_book_contact_sheet", { book_id: bookId });
    expect(sheet.content[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
  });

  it("check the text against the book's rules", async () => {
    const { call } = await connect();
    const bookId = (await call("create_book", { title: "Victoire", spread_count: 1, quote_style: "none", forbidden_words: [{ word: "Maman", use: "Mama" }] })).json
      ?.id as string;
    const spreadId = ((await call("get_book", { book_id: bookId, include: ["spreads"], summary: true })).json?.spreads as { id: string }[])[0]!.id;
    await call("update_spread", { book_id: bookId, spread_id: spreadId, text: "« Maman, viens ! » dit Victoire." });
    const check = await call("check_text", { book_id: bookId, min_severity: "error" });
    const issues = (check.json?.spreads as { issues: { code: string }[] }[])[0]!.issues.map((i) => i.code);
    expect(issues).toEqual(["quote_style", "forbidden_word", "quote_style"]);
    const guide = (await call("get_book", { book_id: bookId, include: ["rules"] })).json?.writing_guide as string;
    expect(guide).toContain("Aucun guillemet");
    expect(guide).toContain("« Maman » (écrire « Mama »)");
  });

  it("hide writing tools from a read-only key", async () => {
    const { client } = await connect({ type: "agent", name: "Relecteur", scope: "read" });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("view_book_contact_sheet");
    expect(names).not.toContain("create_upload");
  });
});

describe("writing helpers", () => {
  it("infer views from French labels", () => {
    expect(["face", "profil droit", "Profil gauche", "dos", "visage", "planche", "expression joyeuse", "trois-quarts"].map(inferView)).toEqual([
      "front",
      "side_right",
      "side_left",
      "back",
      "face",
      "sheet",
      "expression:joyeuse",
      "three_quarter",
    ]);
  });

  it("merge series and book rules, and lint against them", () => {
    const rules = mergeRules(
      { illustrationStyle: "aquarelle", writingRules: "Ton tendre.", quoteStyle: "none", forbiddenWords: [{ word: "Maman", use: "Mama" }] },
      { illustrationStyle: "", writingRules: "Phrases courtes.", quoteStyle: null, forbiddenWords: [], language: "fr" },
    );
    expect(rules).toMatchObject({ writingRules: "Ton tendre.\n\nPhrases courtes.", quoteStyle: "none" });
    expect(lintText("Mama arrive, dit Victoire.", rules, { language: "fr" })).toEqual([]);
    expect(lintText("— Maman !", rules, { language: "fr" }).map((i) => i.code)).toEqual(["dialogue_dash", "forbidden_word", "typography"]);
    expect(lintText("La maman des **renards**.", rules, { language: "fr" }).map((i) => i.code)).toEqual(["forbidden_word", "markdown", "markdown"]);
  });

  it("do not impose a quote style nobody set (the brief may say otherwise)", () => {
    const rules = mergeRules(null, { illustrationStyle: "", writingRules: "", quoteStyle: null, forbiddenWords: [], language: "fr" });
    expect([rules.quoteStyle, rules.quoteStyleSet]).toEqual(["guillemets", false]);
    expect(writingGuide(rules, { language: "fr" })).toContain("pas de règle fixée");
    expect(lintText("Viens, dit Victoire. \"Oui\"", rules, { language: "fr" }).filter((i) => i.code === "quote_style")).toEqual([]);
  });
});
