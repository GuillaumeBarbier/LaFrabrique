import fs from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import { getFormat } from "@/lib/book";
import type { Book } from "@/lib/types";
import { assetFilePath, getAsset } from "./assets";
import { getBook } from "./services/books";
import { imageInfo } from "./services/present";

// Contact sheet (ADR-0008): the whole book on one image — cover, then every spread with its
// illustration on the left and the start of its text on the right — so that an agent checks
// in one look that each image is on the right page.

const COLUMNS = 3;
const GAP = 18;
const LABEL = 26;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if ((line ? `${line} ${word}` : word).length > perLine && line) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  const full = text.replace(/\s+/g, " ").trim();
  if (lines.length === maxLines && lines.join(" ").length < full.length) lines[maxLines - 1] = `${lines[maxLines - 1]?.slice(0, perLine - 1)}…`;
  return lines;
}

async function picture(assetId: string, width: number, height: number, fit: "cover" | "contain", background: string): Promise<Buffer> {
  const asset = getAsset(assetId);
  const { file } = assetFilePath(asset, width > 480 || height > 480 ? "web" : "thumb");
  const source = fs.existsSync(file) ? file : assetFilePath(asset, "print").file;
  return sharp(source).resize({ width, height, fit, background }).flatten({ background }).png().toBuffer();
}

function textPage(text: string, width: number, height: number, pageColor: string, textColor: string): Buffer {
  const size = Math.max(9, Math.round(height / 17));
  const perLine = Math.max(8, Math.floor((width - 20) / (size * 0.55)));
  const maxLines = Math.max(1, Math.floor((height - 20) / (size * 1.3)));
  const lines = text.trim() ? wrap(text, perLine, maxLines) : [];
  const body = lines.length
    ? lines.map((l, i) => `<text x="10" y="${16 + size + i * size * 1.3}" font-size="${size}">${escapeXml(l)}</text>`).join("")
    : `<text x="${width / 2}" y="${height / 2}" font-size="${size}" text-anchor="middle" fill="#B04A3A">sans texte</text>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${pageColor}"/>` +
      `<g font-family="DejaVu Sans, Verdana, sans-serif" fill="${textColor}">${body}</g></svg>`,
  );
}

function placeholder(width: number, height: number, label: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ECEAE4"/>` +
      `<text x="${width / 2}" y="${height / 2}" font-family="DejaVu Sans, Verdana, sans-serif" font-size="${Math.round(height / 14)}" text-anchor="middle" fill="#B04A3A">${escapeXml(label)}</text></svg>`,
  );
}

function caption(width: number, text: string, warn: boolean): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}">` +
      `<text x="2" y="${LABEL - 8}" font-family="DejaVu Sans, Verdana, sans-serif" font-size="15" font-weight="bold" fill="${warn ? "#B04A3A" : "#1F1B16"}">${escapeXml(text)}</text></svg>`,
  );
}

export interface ContactSheet {
  image: Buffer;
  mimeType: "image/jpeg";
  legend: { position: number | null; spreadId: string | null; label: string; words: number; illustration: string; dpi: number | null; characters: string[] }[];
}

/** `size`: page height in pixels on the sheet (small 180, large 300). */
export async function contactSheet(bookId: string, size: "small" | "large" = "small"): Promise<ContactSheet> {
  const book: Book = getBook(bookId);
  const format = getFormat(book.format);
  const pageH = size === "large" ? 300 : 180;
  const pageW = Math.round((pageH * format.widthMm) / format.heightMm);
  const tileW = pageW * 2;
  const tileH = pageH + LABEL;
  const tiles = 1 + book.spreads.length;
  const rows = Math.ceil(tiles / COLUMNS);
  const width = COLUMNS * tileW + (COLUMNS + 1) * GAP;
  const height = rows * tileH + (rows + 1) * GAP;
  const names = new Map(book.characters.map((c) => [c.id, c.name]));
  const layers: OverlayOptions[] = [];
  const legend: ContactSheet["legend"] = [];
  const at = (i: number) => ({ left: GAP + (i % COLUMNS) * (tileW + GAP), top: GAP + Math.floor(i / COLUMNS) * (tileH + GAP) });

  // Cover, centred in its tile.
  const cover = imageInfo(book.cover, format);
  const c0 = at(0);
  layers.push({ input: caption(tileW, `Couverture${cover?.lowResolution ? ` · ${cover.dpi} dpi` : ""}`, !cover || cover.lowResolution), ...c0 });
  layers.push({
    input: book.cover ? await picture(book.cover.id, pageW, pageH, "cover", "#FFFFFF") : placeholder(pageW, pageH, "pas de couverture"),
    left: c0.left + Math.round(pageW / 2),
    top: c0.top + LABEL,
  });
  legend.push({ position: null, spreadId: null, label: "Couverture", words: 0, illustration: cover ? (cover.lowResolution ? "low_resolution" : "ok") : "none", dpi: cover?.dpi ?? null, characters: [] });

  for (const [index, s] of book.spreads.entries()) {
    const p = at(index + 1);
    const info = imageInfo(s.illustration, format);
    const characters = s.characterIds.map((id) => names.get(id) ?? id);
    const label = `${s.position + 1}${info?.lowResolution ? ` · ${info.dpi} dpi` : ""}${characters.length ? ` · ${characters.join(", ")}` : ""}`;
    layers.push({ input: caption(tileW, label.length > 60 ? `${label.slice(0, 59)}…` : label, !info || info.lowResolution || !s.text.trim()), ...p });
    const pageColor = s.pageColor ?? book.typography.pageColor;
    layers.push({
      input: s.illustration ? await picture(s.illustration.id, pageW, pageH, s.illustrationFit, pageColor) : placeholder(pageW, pageH, "pas d'illustration"),
      left: p.left,
      top: p.top + LABEL,
    });
    layers.push({ input: textPage(s.text, pageW, pageH, pageColor, book.typography.textColor), left: p.left + pageW, top: p.top + LABEL });
    legend.push({
      position: s.position,
      spreadId: s.id,
      label: `Double page ${s.position + 1}`,
      words: s.wordCount,
      illustration: info ? (info.lowResolution ? "low_resolution" : "ok") : "none",
      dpi: info?.dpi ?? null,
      characters,
    });
  }

  const image = await sharp({ create: { width, height, channels: 3, background: "#FFFFFF" } })
    .composite(layers)
    .jpeg({ quality: 82 })
    .toBuffer();
  return { image, mimeType: "image/jpeg", legend };
}
