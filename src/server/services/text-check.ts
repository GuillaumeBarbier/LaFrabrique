import { lintText, type TextIssue } from "@/lib/writing";
import { getBook } from "./books";

// check_text (ADR-0008): the book's writing rules applied to every page, so an agent checks
// its work (forbidden words, quotes, typography, length) before handing it over.

export interface TextCheck {
  bookId: string;
  quoteStyle: string;
  forbiddenWords: number;
  counts: { error: number; warning: number; info: number };
  /** Only the spreads with something to say. */
  spreads: { spreadId: string; position: number; issues: TextIssue[] }[];
}

export function checkText(bookId: string, opts: { spreadId?: string; minSeverity?: "error" | "warning" | "info" } = {}): TextCheck {
  const book = getBook(bookId);
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const keep = rank[opts.minSeverity ?? "info"];
  const counts = { error: 0, warning: 0, info: 0 };
  const spreads = book.spreads
    .filter((s) => !opts.spreadId || s.id === opts.spreadId)
    .map((s) => {
      const issues = lintText(s.text, book.effective, { language: book.language, wordsPerSpread: book.wordsPerSpread }).filter(
        (i) => rank[i.severity] <= keep,
      );
      for (const i of issues) counts[i.severity]++;
      return { spreadId: s.id, position: s.position, issues };
    })
    .filter((s) => s.issues.length > 0);
  return { bookId, quoteStyle: book.effective.quoteStyle, forbiddenWords: book.effective.forbiddenWords.length, counts, spreads };
}
