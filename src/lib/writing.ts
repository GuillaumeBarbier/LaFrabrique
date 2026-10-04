// Writing rules of a book or a series (ADR-0008): free rules for the agent, a quote style and
// words to avoid, merged series → book, plus a small linter (check_text).

import { countWords } from "./book";

export const QUOTE_STYLES = ["guillemets", "none", "dashes", "english"] as const;
export type QuoteStyle = (typeof QUOTE_STYLES)[number];

export const QUOTE_STYLE_LABELS: Record<QuoteStyle, string> = {
  guillemets: "« Guillemets »",
  none: "Sans guillemets",
  dashes: "Tirets",
  english: "“Anglais”",
};

export const QUOTE_STYLE_RULES: Record<QuoteStyle, string> = {
  guillemets: "Dialogues entre « guillemets » français, avec espaces insécables à l'intérieur.",
  none: "Aucun guillemet ni tiret de dialogue : les paroles sont rapportées dans la phrase, avec le verbe (Victoire dit qu'elle a faim ; J'ai faim, dit Victoire).",
  dashes: "Dialogues au tiret cadratin (— ) en début de réplique, sans guillemets.",
  english: "Dialogues entre “guillemets anglais”.",
};

export interface ForbiddenWord {
  /** Word or expression to avoid (case-insensitive, whole words). */
  word: string;
  /** What to write instead, if any. */
  use?: string;
}

export interface WritingRules {
  illustrationStyle: string;
  writingRules: string;
  quoteStyle: QuoteStyle;
  /** false: no series or book sets it, `quoteStyle` is the language's default. */
  quoteStyleSet: boolean;
  forbiddenWords: ForbiddenWord[];
}

export function defaultQuoteStyle(language: string): QuoteStyle {
  return language.startsWith("fr") ? "guillemets" : "english";
}

/** Series rules first, then the book's own; the book's quote style wins when set. */
export function mergeRules(
  series: { illustrationStyle: string; writingRules: string; quoteStyle: QuoteStyle | null; forbiddenWords: ForbiddenWord[] } | null,
  book: { illustrationStyle: string; writingRules: string; quoteStyle: QuoteStyle | null; forbiddenWords: ForbiddenWord[]; language: string },
): WritingRules {
  const join = (a: string | undefined, b: string) => [a ?? "", b].map((s) => s.trim()).filter(Boolean).join("\n\n");
  const words = new Map<string, ForbiddenWord>();
  for (const w of [...(series?.forbiddenWords ?? []), ...book.forbiddenWords]) words.set(w.word.toLowerCase(), w);
  return {
    illustrationStyle: join(series?.illustrationStyle, book.illustrationStyle),
    writingRules: join(series?.writingRules, book.writingRules),
    quoteStyle: book.quoteStyle ?? series?.quoteStyle ?? defaultQuoteStyle(book.language),
    quoteStyleSet: (book.quoteStyle ?? series?.quoteStyle ?? null) !== null,
    forbiddenWords: [...words.values()],
  };
}

/** The rules as a short text for the agent (get_book → writingGuide, MCP instructions). */
export function writingGuide(rules: WritingRules, opts: { language: string; wordsPerSpread?: number | null }): string {
  const lines = [
    rules.quoteStyleSet
      ? `- Ponctuation des dialogues : ${QUOTE_STYLE_RULES[rules.quoteStyle]}`
      : `- Ponctuation des dialogues : pas de règle fixée (quote_style) ; suivre le brief s'il en parle, sinon : ${QUOTE_STYLE_RULES[rules.quoteStyle]}`,
  ];
  if (rules.forbiddenWords.length > 0) {
    lines.push(
      `- Mots à ne jamais écrire : ${rules.forbiddenWords.map((w) => (w.use ? `« ${w.word} » (écrire « ${w.use} »)` : `« ${w.word} »`)).join(", ")}.`,
    );
  }
  if (opts.wordsPerSpread) lines.push(`- Longueur : environ ${opts.wordsPerSpread} mots par double page.`);
  if (opts.language.startsWith("fr")) lines.push("- Typographie française : espace insécable avant ; : ! ? et à l'intérieur des « ».");
  lines.push("- Texte brut, sans Markdown ; une ligne vide sépare deux paragraphes.");
  if (rules.writingRules) lines.push("", rules.writingRules);
  return lines.join("\n");
}

export const FORBIDDEN_WORDS_MAX = 100;

/** "Maman → Mama" lines (UI) ↔ ForbiddenWord[]. */
export function parseForbiddenLines(text: string): ForbiddenWord[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, FORBIDDEN_WORDS_MAX)
    .map((line) => {
      const [word, use] = line.split(/\s*(?:→|->|=>)\s*/);
      return use?.trim() ? { word: (word ?? "").trim(), use: use.trim() } : { word: (word ?? "").trim() };
    })
    .filter((w) => w.word.length > 0);
}

export function forbiddenLines(words: ForbiddenWord[]): string {
  return words.map((w) => (w.use ? `${w.word} → ${w.use}` : w.word)).join("\n");
}

// ---------------------------------------------------------------------------------------
// Linter
// ---------------------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "info";

export interface TextIssue {
  code: "forbidden_word" | "quote_style" | "dialogue_dash" | "typography" | "markdown" | "length" | "spaces";
  severity: IssueSeverity;
  message: string;
  /** A few characters around the problem. */
  excerpt: string;
  index: number;
}

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\n/g, " ⏎ ")}${end < text.length ? "…" : ""}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAll(text: string, re: RegExp, make: (m: RegExpExecArray) => Omit<TextIssue, "excerpt" | "index">): TextIssue[] {
  const out: TextIssue[] = [];
  for (const m of text.matchAll(re)) {
    const index = m.index ?? 0;
    out.push({ ...make(m as RegExpExecArray), index, excerpt: excerpt(text, index, m[0].length) });
  }
  return out;
}

/** Checks one page's text against the rules. Pure: shared by check_text and tests. */
export function lintText(text: string, rules: WritingRules, opts: { language: string; wordsPerSpread?: number | null }): TextIssue[] {
  const issues: TextIssue[] = [];
  for (const w of rules.forbiddenWords) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(w.word)}(?![\\p{L}\\p{N}])`, "giu");
    issues.push(
      ...findAll(text, re, (m) => ({
        code: "forbidden_word",
        severity: "error",
        message: w.use ? `« ${m[0]} » est à éviter : écrire « ${w.use} ».` : `« ${m[0]} » est à éviter.`,
      })),
    );
  }

  // Without an explicit rule the brief may say otherwise: dialogue punctuation is not judged.
  const style = rules.quoteStyleSet ? rules.quoteStyle : null;
  const french = /[«»]/g;
  const english = /[“”]/g;
  const straight = /"/g;
  if (style === "none" || style === "dashes") {
    issues.push(
      ...findAll(text, new RegExp(`${french.source}|${english.source}|${straight.source}`, "g"), () => ({
        code: "quote_style",
        severity: "error",
        message: style === "none" ? "Pas de guillemets dans ce livre : rapporter les paroles avec le verbe." : "Dialogues au tiret, sans guillemets.",
      })),
    );
  }
  if (style === "none") {
    issues.push(
      ...findAll(text, /^[ \t]*[—–-][ \t]/gm, () => ({
        code: "dialogue_dash",
        severity: "error",
        message: "Pas de tiret de dialogue dans ce livre : rapporter les paroles avec le verbe.",
      })),
    );
  }
  if (style === "dashes") {
    issues.push(
      ...findAll(text, /^[ \t]*[-–][ \t]/gm, () => ({
        code: "dialogue_dash",
        severity: "warning",
        message: "Tiret cadratin attendu en début de réplique : « — ».",
      })),
    );
  }
  if (style === "guillemets") {
    issues.push(
      ...findAll(text, new RegExp(`${english.source}|${straight.source}`, "g"), () => ({
        code: "quote_style",
        severity: "error",
        message: "Guillemets français attendus : « … ».",
      })),
    );
  }
  if (style === "english") {
    issues.push(
      ...findAll(text, new RegExp(`${french.source}|${straight.source}`, "g"), () => ({
        code: "quote_style",
        severity: "error",
        message: "Guillemets anglais attendus : “…”.",
      })),
    );
  }

  if (opts.language.startsWith("fr")) {
    issues.push(
      ...findAll(text, /(?:[\p{L}\p{N}»)]([;:!?])|[ \t]([;:!?]))/gu, (m) => ({
        code: "typography",
        severity: "info",
        message: m[1]
          ? `Espace insécable attendue avant « ${m[1]} ».`
          : `Espace insécable (et non espace simple) avant « ${m[2]} ».`,
      })),
    );
    if (style === "guillemets" || (style === null && rules.quoteStyle === "guillemets")) {
      issues.push(
        ...findAll(text, /«(?![  ])|(?<![  ])»/g, () => ({
          code: "typography",
          severity: "info",
          message: "Espace insécable attendue à l'intérieur des guillemets.",
        })),
      );
    }
  }

  issues.push(
    ...findAll(text, /\*\*|__|^#{1,6}\s|^\s*[*+]\s/gm, () => ({
      code: "markdown",
      severity: "warning",
      message: "Pas de Markdown : le texte est imprimé tel quel.",
    })),
  );
  issues.push(
    ...findAll(text, / {2,}/g, () => ({ code: "spaces", severity: "info", message: "Espaces multiples." })),
  );

  if (opts.wordsPerSpread) {
    const words = countWords(text);
    if (words > Math.ceil(opts.wordsPerSpread * 1.25)) {
      issues.push({
        code: "length",
        severity: "warning",
        message: `${words} mots pour une cible d'environ ${opts.wordsPerSpread}.`,
        excerpt: "",
        index: 0,
      });
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}
