import { effectiveDpi, getFormat, PRINT_DPI, requiredPixels, type BookFormat } from "@/lib/book";
import type { AssetRef, Book, Character, Spread } from "@/lib/types";

// Light views of books, spreads and characters for agents (ADR-0008): ids, short texts and
// what matters to decide, instead of every URL of every image.

export const BOOK_SECTIONS = ["brief", "rules", "typography", "spreads", "characters"] as const;
export type BookSection = (typeof BOOK_SECTIONS)[number];

export interface ImageInfo {
  id: string;
  width: number | null;
  height: number | null;
  dpi: number | null;
  lowResolution: boolean;
}

export function imageInfo(asset: AssetRef | null, format: BookFormat): ImageInfo | null {
  if (!asset) return null;
  const dpi = asset.width && asset.height ? effectiveDpi(format, asset.width, asset.height) : null;
  return { id: asset.id, width: asset.width, height: asset.height, dpi, lowResolution: dpi !== null && dpi < PRINT_DPI };
}

function excerpt(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function presentSpread(s: Spread, format: BookFormat, summary = false) {
  const illustration = imageInfo(s.illustration, format);
  if (summary) {
    return {
      id: s.id,
      position: s.position,
      excerpt: excerpt(s.text),
      wordCount: s.wordCount,
      illustration: illustration ? (illustration.lowResolution ? "low_resolution" : "ok") : "none",
      dpi: illustration?.dpi ?? null,
      hasBrief: s.illustrationBrief.trim().length > 0,
      characterIds: s.characterIds,
      version: s.version,
    };
  }
  return {
    id: s.id,
    position: s.position,
    text: s.text,
    wordCount: s.wordCount,
    illustration,
    illustrationBrief: s.illustrationBrief,
    illustrationFit: s.illustrationFit,
    notes: s.notes,
    characterIds: s.characterIds,
    textAlign: s.textAlign,
    textValign: s.textValign,
    textSizePt: s.textSizePt,
    pageColor: s.pageColor,
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt,
    version: s.version,
  };
}

export function presentCharacter(c: Character, full = false) {
  const primary = c.images.find((i) => i.primary);
  if (!full) {
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      shared: c.seriesId !== null,
      imageCount: c.images.length,
      primaryImageId: primary?.id ?? null,
      views: [...new Set(c.images.map((i) => i.view))],
    };
  }
  return {
    id: c.id,
    bookId: c.bookId,
    seriesId: c.seriesId,
    name: c.name,
    role: c.role,
    appearance: c.appearance,
    position: c.position,
    images: c.images.map((i) => ({
      id: i.id,
      label: i.label,
      view: i.view,
      primary: i.primary,
      position: i.position,
      width: i.image.width,
      height: i.image.height,
      createdBy: i.createdBy,
    })),
    updatedBy: c.updatedBy,
    version: c.version,
  };
}

export function presentBook(book: Book, opts: { include?: readonly BookSection[]; summary?: boolean } = {}) {
  const include = new Set(opts.include?.length ? opts.include : BOOK_SECTIONS);
  const format = getFormat(book.format);
  const complete = book.spreads.filter((s) => s.text.trim() && s.illustration).length;
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    illustrator: book.illustrator,
    status: book.status,
    format: book.format,
    printPixels: requiredPixels(format),
    language: book.language,
    ageMin: book.ageMin,
    ageMax: book.ageMax,
    wordsPerSpread: book.wordsPerSpread,
    series: book.series,
    cover: imageInfo(book.cover, format),
    spreadCount: book.spreads.length,
    completeSpreads: complete,
    wordCount: book.wordCount,
    openRequests: book.openRequests,
    archivedAt: book.archivedAt,
    updatedAt: book.updatedAt,
    version: book.version,
    ...(include.has("brief") ? { brief: book.brief } : {}),
    ...(include.has("rules")
      ? {
          illustrationStyle: book.illustrationStyle,
          writingRules: book.writingRules,
          quoteStyle: book.quoteStyle,
          forbiddenWords: book.forbiddenWords,
          effective: book.effective,
          writingGuide: book.writingGuide,
        }
      : {}),
    ...(include.has("typography") ? { typography: book.typography } : {}),
    ...(include.has("spreads") ? { spreads: book.spreads.map((s) => presentSpread(s, format, opts.summary)) } : {}),
    ...(include.has("characters") ? { characters: book.characters.map((c) => presentCharacter(c)) } : {}),
  };
}
