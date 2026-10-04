import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { storeImage } from "../assets";
import { migrate, openDatabase, setDbForTests } from "../db";
import { MIGRATIONS } from "../db/migrations";
import type { Actor } from "../http";
import { signAsset, verifyAssetSignature } from "../signing";
import { listActivity } from "./activity";
import { createBook, deleteBook, getBook, restoreActivity, updateSpread } from "./books";
import {
  addCharacterImage,
  characterReferences,
  createCharacter,
  deleteCharacter,
  getCharacter,
  removeCharacterImage,
  updateCharacter,
  updateCharacterImage,
} from "./characters";

const human: Actor = { type: "human", name: "Guillaume", scope: "owner" };
const agent: Actor = { type: "agent", name: "Claude", scope: "write" };

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-"));
  setDbForTests(openDatabase(":memory:"));
});

async function image(color: string) {
  return sharp({ create: { width: 40, height: 60, channels: 4, background: color } }).png().toBuffer();
}

describe("migration 2", () => {
  it("keeps the data of a version 1 database and its foreign keys", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    db.exec(MIGRATIONS[0]!.sql);
    db.prepare("INSERT INTO schema_migrations VALUES (1, 'initial', '2026-10-03')").run();
    db.exec(`INSERT INTO assets VALUES ('a1','illustration','b1',NULL,'image/png','png',1,1,1,'x','t','human','G');
             INSERT INTO books (id,title,format,typography,created_at,updated_at) VALUES ('b1','Livre','square-200','{}','t','t');
             INSERT INTO spreads (id,book_id,position,illustration_asset_id,created_at,updated_at,updated_by_type,updated_by_name)
               VALUES ('s1','b1',0,'a1','t','t','human','G');`);
    migrate(db);
    expect(db.prepare("SELECT character_ids FROM spreads WHERE id = 's1'").get()).toEqual({ character_ids: "[]" });
    expect(db.prepare("SELECT kind FROM assets WHERE id = 'a1'").get()).toEqual({ kind: "illustration" });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() => db.prepare("DELETE FROM assets WHERE id = 'a1'").run()).toThrow(/FOREIGN KEY/);
  });
});

describe("migration 4", () => {
  it("keeps characters, images and history of a version 3 database", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    for (const m of MIGRATIONS.slice(0, 3)) {
      db.pragma(`foreign_keys = ${m.rebuildsTables ? "OFF" : "ON"}`);
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations VALUES (?, ?, 't')").run(m.version, m.name);
    }
    db.pragma("foreign_keys = ON");
    db.exec(`INSERT INTO assets VALUES ('a1','character','b1',NULL,'image/png','png',1,1,1,'x','t','human','G');
             INSERT INTO books (id,title,format,typography,created_at,updated_at) VALUES ('b1','Livre','square-200','{}','t','t');
             INSERT INTO characters VALUES ('c1','b1',0,'Roux','','','t','t','human','G',1);
             INSERT INTO character_images VALUES ('i1','c1','a1','profil gauche',1,0,'t','human','G');
             INSERT INTO activity VALUES ('h1','b1',NULL,'human','G','character.update','Roux : rôle','{}','t','t','c1');`);
    migrate(db);
    expect(db.prepare("SELECT book_id, series_id FROM characters WHERE id = 'c1'").get()).toEqual({ book_id: "b1", series_id: null });
    expect(db.prepare("SELECT view, label FROM character_images WHERE id = 'i1'").get()).toEqual({ view: "", label: "profil gauche" });
    expect(db.prepare("SELECT book_id, character_id, details FROM activity WHERE id = 'h1'").get()).toEqual({ book_id: "b1", character_id: "c1", details: null });
    expect(db.prepare("SELECT series_id, quote_style, forbidden_words FROM books WHERE id = 'b1'").get()).toEqual({ series_id: null, quote_style: null, forbidden_words: "[]" });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(() => db.prepare("DELETE FROM assets WHERE id = 'a1'").run()).toThrow(/FOREIGN KEY/);
    db.prepare("DELETE FROM books WHERE id = 'b1'").run();
    expect(db.prepare("SELECT COUNT(*) n FROM character_images").get()).toEqual({ n: 0 });
  });
});

describe("characters", () => {
  it("keeps one primary reference image and exposes them in the book", async () => {
    const book = createBook({ title: "Le renard", spreads: 2 }, human);
    const roux = createCharacter({ bookId: book.id }, { name: "Roux", role: "le héros", appearance: "renardeau roux, écharpe verte" }, human);
    const a = await storeImage(await image("#d2691e"), { kind: "character", bookId: book.id, actor: human });
    const b = await storeImage(await image("#8b4513"), { kind: "character", bookId: book.id, actor: agent });
    addCharacterImage(roux.id, a, { label: "face" }, human);
    let c = addCharacterImage(roux.id, b, { label: "profil" }, agent);
    expect(c.images.map((i) => [i.label, i.primary])).toEqual([
      ["face", true],
      ["profil", false],
    ]);
    c = updateCharacterImage(roux.id, c.images[1]!.id, { primary: true }, human).character;
    expect(c.images.find((i) => i.primary)?.label).toBe("profil");
    expect(c.images.filter((i) => i.primary)).toHaveLength(1);
    c = removeCharacterImage(roux.id, c.images[1]!.id, human);
    expect(c.images[0]?.primary).toBe(true);
    expect(getBook(book.id).characters[0]?.name).toBe("Roux");
  });

  it("marks who is on a spread and serves their references with temporary links", async () => {
    const book = createBook({ title: "Le renard", spreads: 2 }, human);
    const roux = createCharacter({ bookId: book.id }, { name: "Roux" }, human);
    createCharacter({ bookId: book.id }, { name: "Plume" }, human);
    const a = await storeImage(await image("#d2691e"), { kind: "character", bookId: book.id, actor: human });
    addCharacterImage(roux.id, a, { label: "planche" }, human);
    const spread = book.spreads[0]!;
    updateSpread(book.id, spread.id, { characterIds: [roux.id, roux.id] }, agent);
    expect(getBook(book.id).spreads[0]?.characterIds).toEqual([roux.id]);
    expect(() => updateSpread(book.id, spread.id, { characterIds: ["inconnu"] }, agent)).toThrow(/inconnu/);

    const refs = characterReferences({ bookId: book.id }, { origin: "https://lafabrique.test", spreadId: spread.id });
    expect(refs.characters.map((c) => c.name)).toEqual(["Roux"]);
    const img = refs.characters[0]!.images[0]!;
    expect(img.signedUrl).toMatch(/^https:\/\/lafabrique\.test\/api\/v1\/assets\/\w+\?size=print&exp=\d+&sig=/);
    expect(characterReferences({ bookId: book.id }, { origin: "https://x" }).characters).toHaveLength(2);
  });

  it("restores a deleted character with its images and its pages", async () => {
    const book = createBook({ title: "Le renard", spreads: 1 }, human);
    const roux = createCharacter({ bookId: book.id }, { name: "Roux" }, human);
    const a = await storeImage(await image("#d2691e"), { kind: "character", bookId: book.id, actor: human });
    addCharacterImage(roux.id, a, { label: "face" }, human);
    updateSpread(book.id, book.spreads[0]!.id, { characterIds: [roux.id] }, human);
    deleteCharacter(roux.id, agent);
    expect(getBook(book.id).characters).toHaveLength(0);
    expect(getBook(book.id).spreads[0]?.characterIds).toEqual([]);
    const entry = listActivity({ bookId: book.id }).find((e) => e.action === "character.delete")!;
    restoreActivity(entry.id, human);
    const back = getBook(book.id);
    expect(back.characters[0]?.images[0]?.label).toBe("face");
    expect(back.spreads[0]?.characterIds).toEqual([roux.id]);
  });

  it("restores a sheet edited by the agent, separately from another character", () => {
    const book = createBook({ title: "Le renard", spreads: 0 }, human);
    const roux = createCharacter({ bookId: book.id }, { name: "Roux", appearance: "roux" }, human);
    const plume = createCharacter({ bookId: book.id }, { name: "Plume" }, human);
    updateCharacter(roux.id, { appearance: "gris" }, agent);
    updateCharacter(plume.id, { role: "l'oie" }, agent);
    const edit = listActivity({ bookId: book.id }).find((e) => e.action === "character.update" && e.characterId === roux.id)!;
    restoreActivity(edit.id, human);
    expect(getCharacter(roux.id).appearance).toBe("roux");
    expect(getCharacter(plume.id).role).toBe("l'oie");
  });

  it("goes away with its book", async () => {
    const book = createBook({ title: "Le renard", spreads: 0 }, human);
    const roux = createCharacter({ bookId: book.id }, { name: "Roux" }, human);
    const a = await storeImage(await image("#d2691e"), { kind: "character", bookId: book.id, actor: human });
    addCharacterImage(roux.id, a, {}, human);
    deleteBook(book.id, human);
    expect(() => getCharacter(roux.id)).toThrow();
  });
});

describe("temporary links", () => {
  it("accept their own signature until expiry only", () => {
    const { exp, sig } = signAsset("abc", "print", 60);
    expect(verifyAssetSignature("abc", "print", exp, sig)).toBe(true);
    expect(verifyAssetSignature("abc", "web", exp, sig)).toBe(false);
    expect(verifyAssetSignature("abd", "print", exp, sig)).toBe(false);
    expect(verifyAssetSignature("abc", "print", exp, sig, (exp + 1) * 1000)).toBe(false);
  });
});
