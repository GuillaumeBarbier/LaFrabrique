#!/usr/bin/env node
// End-to-end example (ADR-0008): what an agent does by MCP alone, with local image files.
// Series → 4 characters × 5 reference images → book of the series → illustration and cover →
// text check → contact sheet. Files go through signed upload URLs with curl, like in a sandbox.
//
//   LAFABRIQUE_KEY=lfab_… node scripts/exemple-serie.mjs [--url https://lafabrique.guillaume-barbier.com] [--images ./dossier]
//
// --images: a folder with <name>-<view>.png files (e.g. victoire-face.png); without it, sample
// images are drawn in a temporary folder.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = flag("url", "http://localhost:3000").replace(/\/$/, "");
const key = process.env.LAFABRIQUE_KEY;
if (!key) {
  console.error("LAFABRIQUE_KEY manquante (Paramètres › Agents IA › Créer une clé, portée écriture).");
  process.exit(1);
}

const CHARACTERS = [
  { name: "Victoire", role: "l'aînée, 7 ans", appearance: "Cheveux châtains en queue de cheval, salopette jaune, baskets rouges.", color: "#E8B23A" },
  { name: "Constance", role: "la cadette, 4 ans", appearance: "Boucles blondes, robe bleue à pois blancs, doudou lapin.", color: "#5B8BD9" },
  { name: "Papa", role: "le papa", appearance: "Grand, barbe courte brune, pull vert, lunettes rondes.", color: "#4E9A5B" },
  { name: "Mama", role: "la maman", appearance: "Cheveux bruns au carré, chemise rayée bleu et blanc, sourire.", color: "#C8553D" },
];
const VIEWS = [
  { file: "face", label: "face" },
  { file: "profil-droit", label: "profil droit" },
  { file: "profil-gauche", label: "profil gauche" },
  { file: "dos", label: "dos" },
  { file: "visage", label: "visage" },
];

async function sampleImages(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const draw = (w, h, color, text) =>
    sharp({ create: { width: w, height: h, channels: 3, background: color } })
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="50%" y="50%" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(w / 12)}" text-anchor="middle" fill="white">${text}</text></svg>`,
          ),
        },
      ])
      .png();
  for (const c of CHARACTERS) {
    for (const v of VIEWS) {
      const [w, h] = v.file === "visage" ? [1024, 1024] : [800, 1600];
      await draw(w, h, c.color, `${c.name} · ${v.label}`).toFile(path.join(dir, `${c.name.toLowerCase()}-${v.file}.png`));
    }
  }
  await draw(2480, 2480, "#F2C14E", "Page 1").toFile(path.join(dir, "page-1.png"));
  await draw(2480, 2480, "#7AB8D9", "Couverture").toFile(path.join(dir, "couverture.png"));
  return dir;
}

const dir = flag("images") ?? (await sampleImages(fs.mkdtempSync(path.join(os.tmpdir(), "lafabrique-exemple-"))));
const client = new Client({ name: "exemple-serie", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));

async function call(name, params) {
  const res = await client.callTool({ name, arguments: params });
  const first = res.content[0];
  if (res.isError) throw new Error(`${name} : ${first?.text}`);
  return first?.type === "text" ? JSON.parse(first.text) : res.content;
}

/** What the agent runs in its sandbox for each ticket: curl -T file "<upload_url>". */
function send(ticket) {
  const out = execFileSync("curl", ["-sS", "--fail-with-body", "-T", path.join(dir, ticket.filename), ticket.upload_url], { encoding: "utf8" });
  return JSON.parse(out);
}

const step = (text) => console.log(`\n▸ ${text}`);

step("Série");
const series = await call("create_series", {
  title: `Victoire et Constance (exemple ${new Date().toISOString().slice(0, 16)})`,
  description: "Deux sœurs, leurs parents, une maison au bord de la mer.",
  illustration_style: "Aquarelle douce, contours encrés fins, palette pastel, lumière d'été.",
  writing_rules: "Phrases courtes au présent. Ton tendre et drôle.",
  quote_style: "none",
  forbidden_words: [{ word: "Maman", use: "Mama" }],
  format: "square-200",
  age_min: 3,
  age_max: 6,
});
console.log(series);

step("4 personnages × 5 images de référence (create_upload → curl -T → create_character)");
for (const c of CHARACTERS) {
  const { uploads } = await call("create_upload", {
    series_id: series.id,
    kind: "image",
    files: VIEWS.map((v) => ({ filename: `${c.name.toLowerCase()}-${v.file}.png`, label: v.label })),
  });
  for (const t of uploads) send(t);
  const created = await call("create_character", {
    series_id: series.id,
    name: c.name,
    role: c.role,
    appearance: c.appearance,
    images: uploads.map((u) => ({ upload_id: u.upload_id })),
  });
  console.log(created);
}

step("Livre de la série (personnages liés, style et règles hérités)");
const book = await call("create_book", { title: "La grande vague", series_id: series.id, spread_count: 3 });
console.log(book);
const [first] = book.spread_ids;
const characters = Object.fromEntries(book.characters.map((c) => [c.name, c.id]));

step("Texte, puis vérification des règles");
await call("update_spread", {
  book_id: book.id,
  spread_id: first,
  text: "« Maman, regarde ! » crie Victoire.",
  illustration_brief: "Victoire montre la mer à Mama, Constance serre son doudou.",
  character_ids: [characters.Victoire, characters.Constance, characters.Mama],
});
const check = await call("check_text", { book_id: book.id, min_severity: "error" });
console.log(check.counts, check.spreads[0]?.issues.map((i) => i.message));
await call("update_spread", { book_id: book.id, spread_id: first, text: "Mama, regarde la vague ! crie Victoire." });
console.log((await call("check_text", { book_id: book.id, min_severity: "error" })).counts);

step("Références pour illustrer la page 1");
const refs = await call("get_references", { book_id: book.id, spread_id: first, images: "none" });
console.log({ illustration_style: refs.illustration_style, characters: refs.characters.map((c) => ({ name: c.name, by_view: Object.keys(c.by_view) })) });

step("Illustration et couverture (auto_commit)");
const { uploads } = await call("create_upload", {
  book_id: book.id,
  auto_commit: true,
  files: [
    { kind: "spread_illustration", target_id: first, filename: "page-1.png" },
    { kind: "cover", filename: "couverture.png" },
  ],
});
for (const t of uploads) {
  const r = send(t);
  console.log(r.status, r.kind, `${r.asset.width}×${r.asset.height}`, `${r.dpi} dpi`, r.warnings.map((w) => w.code));
}

step("Planche contact");
const sheet = await call("view_book_contact_sheet", { book_id: book.id });
const out = path.join(dir, "planche-contact.jpg");
fs.writeFileSync(out, Buffer.from(sheet[0].data, "base64"));
console.log(out, JSON.parse(sheet[1].text).legend.map((l) => `${l.label}: ${l.illustration}`));

step("Historique (attribution et détail des images)");
const activity = await call("list_activity", { book_id: book.id, limit: 5 });
for (const a of activity) console.log(a.actor.name, a.actor.type, a.summary, a.details.map((d) => `${d.target} ${d.filename ?? ""} ${d.dpi ?? ""}`.trim()));

await client.close();
