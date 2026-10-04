import { z } from "zod";
import { BOOK_FORMATS, TEXT_ALIGNS, TEXT_VALIGNS } from "@/lib/book";
import { isImageView } from "@/lib/views";
import { FORBIDDEN_WORDS_MAX, QUOTE_STYLES } from "@/lib/writing";
import { fontKeyExists } from "./fonts";

// Validation pieces shared by books and series (REST and MCP).

export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB.");
export const fontKey = z.string().min(1).max(80).refine(fontKeyExists, "Police inconnue (voir GET /api/v1/fonts).");
export const age = z.number().int().min(0).max(18).nullable();
export const formatKey = z.enum(BOOK_FORMATS.map((f) => f.key) as [string, ...string[]]);
export const language = z.string().min(2).max(8);
export const quoteStyle = z.enum(QUOTE_STYLES);

export const typographyPatchSchema = z
  .object({
    titleFont: fontKey,
    bodyFont: fontKey,
    titleSizePt: z.number().min(8).max(144),
    bodySizePt: z.number().min(6).max(96),
    lineHeight: z.number().min(0.8).max(3),
    textColor: hex,
    pageColor: hex,
    textAlign: z.enum(TEXT_ALIGNS),
    textValign: z.enum(TEXT_VALIGNS),
  })
  .partial()
  .strict();

export const forbiddenWordsSchema = z
  .array(z.object({ word: z.string().trim().min(1).max(80), use: z.string().trim().max(80).optional() }).strict())
  .max(FORBIDDEN_WORDS_MAX);

/** Style and rules a book or a series carries (ADR-0008). */
export const rulesSchema = {
  illustrationStyle: z.string().max(10_000),
  writingRules: z.string().max(10_000),
  quoteStyle: quoteStyle.nullable(),
  forbiddenWords: forbiddenWordsSchema,
};

/** Normalised view of a reference image (src/lib/views.ts). */
export const imageView = z
  .string()
  .max(60)
  .refine(isImageView, "Vue inconnue : front, three_quarter, side_left, side_right, back, face, sheet, other ou expression:<nom>.");
