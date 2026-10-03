// API shapes, shared by the server, the interface and the agents (docs/tech/02-api-agents.md).
import type { BookStatus, IllustrationFit, TextAlign, TextValign, Typography } from "./book";

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
  updatedAt: string;
  updatedBy: ActorRef;
  version: number;
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
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  version: number;
  spreads: Spread[];
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

export interface ActivityEntry {
  id: string;
  bookId: string;
  spreadId: string | null;
  actor: ActorRef;
  action: string;
  summary: string;
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
