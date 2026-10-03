import type { BookStatus, IllustrationFit, TextAlign, TextValign, Typography } from "@/lib/book";
import { DEFAULT_TYPOGRAPHY, countWords } from "@/lib/book";
import type { ActorType, AssetRef, Spread } from "@/lib/types";
import type { DB } from "../db";

export interface BookRow {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  illustrator: string;
  language: string;
  age_min: number | null;
  age_max: number | null;
  status: BookStatus;
  format: string;
  cover_asset_id: string | null;
  typography: string;
  brief: string;
  words_per_spread: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

export interface SpreadRow {
  id: string;
  book_id: string;
  position: number;
  text: string;
  illustration_asset_id: string | null;
  illustration_brief: string;
  illustration_fit: IllustrationFit;
  notes: string;
  text_align: TextAlign | null;
  text_valign: TextValign | null;
  text_size_pt: number | null;
  page_color: string | null;
  created_at: string;
  updated_at: string;
  updated_by_type: ActorType;
  updated_by_name: string;
  version: number;
}

export function parseTypography(json: string): Typography {
  try {
    return { ...DEFAULT_TYPOGRAPHY, ...(JSON.parse(json) as Partial<Typography>) };
  } catch {
    return { ...DEFAULT_TYPOGRAPHY };
  }
}

export function assetUrls(id: string): Pick<AssetRef, "url" | "webUrl" | "thumbUrl"> {
  const base = `/api/v1/assets/${id}`;
  return { url: base, webUrl: `${base}?size=web`, thumbUrl: `${base}?size=thumb` };
}

export function loadAssetRefs(db: DB, ids: (string | null)[]): Map<string, AssetRef> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, AssetRef>();
  if (wanted.length === 0) return map;
  const rows = db
    .prepare(`SELECT id, width, height FROM assets WHERE id IN (${wanted.map(() => "?").join(",")})`)
    .all(...wanted) as { id: string; width: number | null; height: number | null }[];
  for (const r of rows) map.set(r.id, { id: r.id, width: r.width, height: r.height, ...assetUrls(r.id) });
  return map;
}

export function toSpread(row: SpreadRow, assets: Map<string, AssetRef>): Spread {
  return {
    id: row.id,
    position: row.position,
    text: row.text,
    wordCount: countWords(row.text),
    illustration: row.illustration_asset_id ? (assets.get(row.illustration_asset_id) ?? null) : null,
    illustrationBrief: row.illustration_brief,
    illustrationFit: row.illustration_fit,
    notes: row.notes,
    textAlign: row.text_align,
    textValign: row.text_valign,
    textSizePt: row.text_size_pt,
    pageColor: row.page_color,
    updatedAt: row.updated_at,
    updatedBy: { type: row.updated_by_type, name: row.updated_by_name },
    version: row.version,
  };
}
