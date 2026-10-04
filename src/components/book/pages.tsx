/* eslint-disable @next/next/no-img-element -- private, authenticated assets: no image optimiser. */
"use client";

import { ImageIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { getFormat, type Typography } from "@/lib/book";
import { fontFamilyCss } from "@/lib/fonts";
import type { Book, Spread } from "@/lib/types";
import styles from "./pages.module.css";

const VALIGN = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

/** What drawing a spread needs (the editor's spreads, or a shared book's). */
export type PageSpread = Pick<Spread, "text" | "illustration" | "illustrationBrief" | "illustrationFit" | "pageColor" | "textSizePt" | "textAlign" | "textValign">;

/** CSS variables of a page: format, typography, spread overrides. */
export function pageVars(format: string, typo: Typography, spread?: PageSpread | null): CSSProperties {
  const f = getFormat(format);
  return {
    "--page-w-mm": f.widthMm,
    "--page-h-mm": f.heightMm,
    "--page-w-pt": (f.widthMm * 72) / 25.4,
    "--page-color": spread?.pageColor ?? typo.pageColor,
    "--text-color": typo.textColor,
    "--font-body": fontFamilyCss(typo.bodyFont),
    "--font-title": fontFamilyCss(typo.titleFont),
    "--size-pt": spread?.textSizePt ?? typo.bodySizePt,
    "--title-pt": typo.titleSizePt,
    "--line-height": typo.lineHeight,
    "--align": spread?.textAlign ?? typo.textAlign,
    "--valign": VALIGN[spread?.textValign ?? typo.textValign],
  } as CSSProperties;
}

export type ImageSize = "thumb" | "web" | "print";

function imageUrl(spread: PageSpread, size: ImageSize): string | null {
  if (!spread.illustration) return null;
  return size === "thumb" ? spread.illustration.thumbUrl : size === "web" ? spread.illustration.webUrl : spread.illustration.printUrl;
}

export function IllustrationContent({ spread, size, showBrief = true }: { spread: PageSpread; size: ImageSize; showBrief?: boolean }) {
  const url = imageUrl(spread, size);
  if (url) {
    return (
      <img
        src={url}
        alt={spread.illustrationBrief || ""}
        className={[styles.illustration, spread.illustrationFit === "contain" && styles.contain].filter(Boolean).join(" ")}
        draggable={false}
      />
    );
  }
  if (!showBrief) return null;
  return (
    <div className={styles.placeholder}>
      <ImageIcon aria-hidden />
      {spread.illustrationBrief ? <span className={styles.brief}>{spread.illustrationBrief}</span> : <span>Illustration</span>}
    </div>
  );
}

/** Read-only spread: thumbnails, reader. */
export function SpreadView({
  book,
  spread,
  size = "web",
  showBrief = true,
  className,
}: {
  book: Pick<Book, "format" | "typography" | "language">;
  spread: PageSpread;
  size?: ImageSize;
  showBrief?: boolean;
  className?: string;
}) {
  return (
    <div className={[styles.spread, className].filter(Boolean).join(" ")} style={pageVars(book.format, book.typography, spread)} lang={book.language}>
      <div className={`${styles.page} ${styles.left}`}>
        <IllustrationContent spread={spread} size={size} showBrief={showBrief} />
      </div>
      <div className={`${styles.page} ${styles.right}`}>
        <div className={styles.textBox}>
          <p className={styles.text}>{spread.text}</p>
        </div>
      </div>
    </div>
  );
}

/** Title page (printed page 1, recto): generated from the title, the authors and the title font. */
export function TitlePageContent({ book }: { book: Pick<Book, "title" | "subtitle" | "author" | "illustrator"> }) {
  const byline = [book.author, book.illustrator && book.illustrator !== book.author ? book.illustrator : ""].filter(Boolean).join(" · ");
  return (
    <div className={styles.titlePage}>
      <h1 className={styles.titleText}>{book.title}</h1>
      {book.subtitle && <p className={styles.subtitleText}>{book.subtitle}</p>}
      {byline && <p className={styles.byline}>{byline}</p>}
    </div>
  );
}

export function CoverContent({ book, size }: { book: Pick<Book, "cover" | "title" | "subtitle" | "author" | "illustrator">; size: ImageSize }) {
  const url = book.cover ? (size === "thumb" ? book.cover.thumbUrl : size === "web" ? book.cover.webUrl : book.cover.printUrl) : null;
  return (
    <>
      {url && <img src={url} alt="" className={`${styles.illustration} ${styles.coverImage}`} draggable={false} />}
      {!url && <TitlePageContent book={book} />}
    </>
  );
}

export function SinglePage({
  book,
  children,
  className,
  style,
}: {
  book: Pick<Book, "format" | "typography" | "language">;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={[styles.page, styles.single, className].filter(Boolean).join(" ")}
      style={{ ...pageVars(book.format, book.typography), ...style }}
      lang={book.language}
    >
      {children}
    </div>
  );
}

export const pageStyles = styles;
