// Book domain constants shared by the server, the UI and the agents (ADR-0003).

export const BOOK_STATUSES = ["idea", "writing", "illustrating", "review", "done"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const STATUS_LABELS: Record<BookStatus, string> = {
  idea: "Idée",
  writing: "Écriture",
  illustrating: "Illustration",
  review: "Relecture",
  done: "Terminé",
};

export const STATUS_HINTS: Record<BookStatus, string> = {
  idea: "L'histoire se cherche : pitch, personnages, brief.",
  writing: "Le texte des doubles pages s'écrit.",
  illustrating: "Le texte tient, les illustrations arrivent.",
  review: "Tout est là : relecture, ajustements de mise en page.",
  done: "Prêt à lire et à imprimer.",
};

export interface BookFormat {
  key: string;
  label: string;
  /** Single page size, in millimetres. */
  widthMm: number;
  heightMm: number;
}

export const BOOK_FORMATS: readonly BookFormat[] = [
  { key: "square-200", label: "Carré 20 × 20 cm", widthMm: 200, heightMm: 200 },
  { key: "square-150", label: "Petit carré 15 × 15 cm", widthMm: 150, heightMm: 150 },
  { key: "square-216", label: "Carré 21,6 × 21,6 cm (8,5″)", widthMm: 216, heightMm: 216 },
  { key: "square-250", label: "Grand carré 25 × 25 cm", widthMm: 250, heightMm: 250 },
  { key: "portrait-210x280", label: "Portrait 21 × 28 cm", widthMm: 210, heightMm: 280 },
  { key: "landscape-280x210", label: "Paysage 28 × 21 cm", widthMm: 280, heightMm: 210 },
];

export const DEFAULT_FORMAT = "square-200";
export const BLEED_MM = 3;
export const PRINT_DPI = 300;

export function getFormat(key: string): BookFormat {
  return BOOK_FORMATS.find((f) => f.key === key) ?? (BOOK_FORMATS[0] as BookFormat);
}

/** Pixels an illustration needs to print one page at PRINT_DPI, bleed included. */
export function requiredPixels(format: BookFormat): { width: number; height: number } {
  const toPx = (mm: number) => Math.ceil(((mm + 2 * BLEED_MM) / 25.4) * PRINT_DPI);
  return { width: toPx(format.widthMm), height: toPx(format.heightMm) };
}

/** Effective print resolution of an image covering one page (object-fit: cover). */
export function effectiveDpi(format: BookFormat, imageWidth: number, imageHeight: number): number {
  const wIn = (format.widthMm + 2 * BLEED_MM) / 25.4;
  const hIn = (format.heightMm + 2 * BLEED_MM) / 25.4;
  // "cover" scales the image by the larger ratio: the limiting side sets the resolution.
  return Math.floor(Math.min(imageWidth / wIn, imageHeight / hIn));
}

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;
export type TextValign = (typeof TEXT_VALIGNS)[number];
export const ILLUSTRATION_FITS = ["cover", "contain"] as const;
export type IllustrationFit = (typeof ILLUSTRATION_FITS)[number];

export const LANGUAGES = [
  { key: "fr", label: "Français" },
  { key: "en", label: "Anglais" },
  { key: "es", label: "Espagnol" },
  { key: "de", label: "Allemand" },
  { key: "it", label: "Italien" },
] as const;

export interface Typography {
  titleFont: string;
  bodyFont: string;
  titleSizePt: number;
  bodySizePt: number;
  lineHeight: number;
  textColor: string;
  pageColor: string;
  textAlign: TextAlign;
  textValign: TextValign;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  titleFont: "fredoka",
  bodyFont: "andika",
  titleSizePt: 36,
  bodySizePt: 18,
  lineHeight: 1.45,
  textColor: "#1F1B16",
  pageColor: "#FFFDF7",
  textAlign: "left",
  textValign: "middle",
};

/** Kid-friendly page and ink colours offered as swatches (any hex stays possible). */
export const PAGE_SWATCHES = ["#FFFFFF", "#FFFDF7", "#FDF3E1", "#FCE9E6", "#EAF4EC", "#E7F0FA", "#F1ECFA", "#1F1B16"];
export const INK_SWATCHES = ["#1F1B16", "#3D3C38", "#7A2E1D", "#1E4D7B", "#2F5D3A", "#5B3A8C", "#FFFFFF"];

/** Rough words-per-spread guide by youngest target age (classic picture-book practice). */
export function suggestedWordsPerSpread(ageMin: number | null): number | null {
  if (ageMin === null) return null;
  if (ageMin <= 2) return 15;
  if (ageMin <= 4) return 40;
  if (ageMin <= 6) return 80;
  return 150;
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

/**
 * Printed pagination (ADR-0003): page 1 is the title page (recto), each spread takes
 * the next verso/recto pair, an end page closes the book if needed.
 */
export function printedPageCount(spreadCount: number): { pages: number; multipleOf4: boolean } {
  // title page + 2 per spread, then pad to an even count with an end page.
  let pages = 1 + spreadCount * 2;
  if (pages % 2 === 1) pages += 1;
  return { pages, multipleOf4: pages % 4 === 0 };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}
