// API shapes, shared by the server, the interface and the agents (docs/tech/02-api-agents.md).
import type { BookStatus, IllustrationFit, TextAlign, TextValign, Typography } from "./book";
import type { ForbiddenWord, QuoteStyle, WritingRules } from "./writing";

export type ActorType = "human" | "agent";

export interface ActorRef {
  type: ActorType;
  name: string;
}

export interface AssetRef {
  id: string;
  width: number | null;
  height: number | null;
  /** Original file, as uploaded. */
  url: string;
  /** Full resolution in a format browsers display (the original, or a JPEG of a TIFF). */
  printUrl: string;
  /** WebP, 1800 px at most. */
  webUrl: string;
  /** WebP, 480 px at most. */
  thumbUrl: string;
}

export interface Spread {
  id: string;
  position: number;
  text: string;
  wordCount: number;
  illustration: AssetRef | null;
  illustrationBrief: string;
  illustrationFit: IllustrationFit;
  notes: string;
  /** Per-spread overrides of the book typography (null = book value). */
  textAlign: TextAlign | null;
  textValign: TextValign | null;
  textSizePt: number | null;
  pageColor: string | null;
  /** Characters present on this spread (ids of book.characters): their references guide the illustration. */
  characterIds: string[];
  updatedAt: string;
  updatedBy: ActorRef;
  version: number;
}

export interface CharacterImage {
  id: string;
  /** What the image shows: "face", "profil", "planche", "expression joyeuse"… */
  label: string;
  /** Normalised view (src/lib/views.ts): front, side_left, side_right, back, face, expression:<name>… */
  view: string;
  /** The reference to use first. One per character. */
  primary: boolean;
  position: number;
  image: AssetRef;
  createdAt: string;
  createdBy: ActorRef;
}

export interface Character {
  id: string;
  /** Owner: a book, or a series (then shared by every book of the series). */
  bookId: string | null;
  seriesId: string | null;
  name: string;
  /** Who they are in the story: "le héros, un renardeau de 6 ans". */
  role: string;
  /** What they look like, in words: colours, clothes, distinctive features. */
  appearance: string;
  position: number;
  images: CharacterImage[];
  updatedAt: string;
  updatedBy: ActorRef;
  version: number;
}

export interface ReferenceImage {
  id: string;
  label: string;
  view: string;
  primary: boolean;
  width: number | null;
  height: number | null;
  /** Absolute, full resolution; needs the API key. */
  url: string;
  /** Absolute, full resolution (JPEG/PNG/WebP), readable without key until `expiresAt`: for image generators. */
  signedUrl: string;
  /** Same, screen size (WebP, 1800 px). */
  signedWebUrl: string;
}

export interface CharacterReference {
  id: string;
  seriesId: string | null;
  name: string;
  role: string;
  appearance: string;
  /** Primary first, then by view (front, three-quarter, profiles, back, face, expressions, sheets). */
  images: ReferenceImage[];
  /** Image ids by view: { front: [...], side_right: [...] }. */
  byView: Record<string, string[]>;
}

/** What an illustrating agent needs: who is on the page and what they look like. */
export interface References {
  bookId: string;
  seriesId: string | null;
  spreadId: string | null;
  /** Style of the series and the book, to give the image generator with every request. */
  illustrationStyle: string;
  illustrationBrief: string | null;
  expiresAt: string;
  characters: CharacterReference[];
}

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  illustrator: string;
  language: string;
  ageMin: number | null;
  ageMax: number | null;
  status: BookStatus;
  format: string;
  cover: AssetRef | null;
  typography: Typography;
  brief: string;
  wordsPerSpread: number | null;
  seriesId: string | null;
  series: { id: string; title: string } | null;
  /** The book's own style and rules, added to the series' ones (see `effective`). */
  illustrationStyle: string;
  writingRules: string;
  quoteStyle: QuoteStyle | null;
  forbiddenWords: ForbiddenWord[];
  /** Rules that apply: series + book. */
  effective: WritingRules;
  /** The same as a short text for the agent. */
  writingGuide: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  version: number;
  spreads: Spread[];
  characters: Character[];
  wordCount: number;
  openRequests: { forAgent: number; forHuman: number };
}

export interface BookSummary {
  id: string;
  title: string;
  subtitle: string;
  status: BookStatus;
  format: string;
  /** Cover thumbnail, or the first illustration when there is no cover yet. */
  coverThumbUrl: string | null;
  coverIsIllustration: boolean;
  titleFont: string;
  pageColor: string;
  textColor: string;
  spreadCount: number;
  completeSpreads: number;
  updatedAt: string;
  archivedAt: string | null;
  openRequests: { forAgent: number; forHuman: number };
}

export interface Comment {
  id: string;
  bookId: string;
  spreadId: string | null;
  parentId: string | null;
  author: ActorRef;
  body: string;
  addressedTo: ActorType | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

/** What an image change was about (history details). */
export interface ActivityDetail {
  target: "spread_illustration" | "cover" | "character_image";
  targetId: string | null;
  assetId: string | null;
  previousAssetId?: string | null;
  imageId?: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  dpi?: number | null;
  view?: string;
  label?: string;
  removed?: boolean;
}

export interface ActivityEntry {
  id: string;
  bookId: string | null;
  seriesId: string | null;
  spreadId: string | null;
  characterId: string | null;
  actor: ActorRef;
  action: string;
  summary: string;
  details: ActivityDetail[];
  restorable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFont {
  id: string;
  /** Value to use in typography.titleFont / bodyFont. */
  key: string;
  name: string;
  format: string;
  url: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Series {
  id: string;
  title: string;
  description: string;
  illustrationStyle: string;
  writingRules: string;
  quoteStyle: QuoteStyle | null;
  forbiddenWords: ForbiddenWord[];
  language: string;
  ageMin: number | null;
  ageMax: number | null;
  /** Defaults given to new books of the series. */
  format: string | null;
  typography: Partial<Typography> | null;
  wordsPerSpread: number | null;
  characters: Character[];
  books: { id: string; title: string; status: BookStatus }[];
  createdAt: string;
  updatedAt: string;
  updatedBy: ActorRef;
  archivedAt: string | null;
  version: number;
}

export interface SeriesSummary {
  id: string;
  title: string;
  description: string;
  characterCount: number;
  bookCount: number;
  updatedAt: string;
}

export type UploadKind = "spread_illustration" | "cover" | "character_image" | "image";

export interface UploadTicket {
  uploadId: string;
  kind: UploadKind;
  targetId: string | null;
  filename: string;
  /** Single use, no key needed, until expiresAt. */
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  curl: string;
}

export interface UploadWarning {
  code: "lowResolution" | "aspectRatio" | "converted";
  message: string;
}

export interface UploadResult {
  uploadId: string;
  status: "received" | "attached" | "ready";
  kind: UploadKind;
  targetId: string | null;
  filename: string;
  asset: { id: string; width: number | null; height: number | null; format: string; sizeBytes: number };
  /** Print resolution on the book's page (illustration, cover). */
  dpi: number | null;
  printPixels: { width: number; height: number } | null;
  /** Character image id, once attached. */
  imageId?: string;
  warnings: UploadWarning[];
}
