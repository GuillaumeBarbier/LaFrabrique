"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CoverContent, IllustrationContent, pageStyles, pageVars, TitlePageContent } from "@/components/book/pages";
import { Button, LinkButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { BLEED_MM, effectiveDpi, getFormat, PRINT_DPI, printedPageCount } from "@/lib/book";
import type { Book, Spread } from "@/lib/types";
import styles from "./print.module.css";

interface Options {
  bleed: boolean;
  cover: boolean;
  spreads: boolean;
}

export function PrintView({ book, options }: { book: Book; options: Options }) {
  const router = useRouter();
  const pathname = usePathname();
  const f = getFormat(book.format);
  const bleed = options.bleed && !options.spreads ? BLEED_MM : 0;
  const pageW = f.widthMm + 2 * bleed;
  const pageH = f.heightMm + 2 * bleed;
  const sheetW = options.spreads ? f.widthMm * 2 : pageW;
  const sheetH = options.spreads ? f.heightMm : pageH;
  const { pages, multipleOf4 } = printedPageCount(book.spreads.length);

  const set = (patch: Partial<Options>) => {
    const next = { ...options, ...patch };
    const q = new URLSearchParams();
    if (next.bleed) q.set("fondsPerdus", "1");
    if (!next.cover) q.set("couverture", "0");
    if (next.spreads) q.set("planches", "1");
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`);
  };

  // Page variables sized to the sheet (bleed included) so type sizes stay true.
  const vars = (spread?: Spread | null): CSSProperties => {
    const v = pageVars(book.format, book.typography, spread) as Record<string, unknown>;
    return { ...v, "--page-w-mm": pageW, "--page-h-mm": pageH, "--page-w-pt": (pageW * 72) / 25.4 } as CSSProperties;
  };

  const warnings: string[] = [];
  book.spreads.forEach((s, i) => {
    if (!s.illustration) warnings.push(`Double page ${i + 1} : illustration manquante.`);
    else if (s.illustration.width && s.illustration.height) {
      const dpi = effectiveDpi(f, s.illustration.width, s.illustration.height);
      if (dpi < PRINT_DPI) warnings.push(`Double page ${i + 1} : illustration à ${dpi} dpi (300 conseillés).`);
    }
    if (!s.text.trim()) warnings.push(`Double page ${i + 1} : texte vide.`);
  });
  if (!multipleOf4) warnings.push(`${pages} pages intérieures : un imprimeur attend un multiple de 4.`);

  const sheet = (key: string, label: string, content: ReactNode) => (
    <div key={key} style={{ display: "contents" }}>
      <span className={styles.sheetLabel}>{label}</span>
      <div className={styles.sheet} style={{ width: `${sheetW}mm`, height: `${sheetH}mm` }}>
        {content}
      </div>
    </div>
  );

  const single = (spread: Spread | null, children: ReactNode, side: "left" | "right" | "single") => (
    <div className={`${pageStyles.page} ${side === "left" ? pageStyles.left : ""}`} style={vars(spread)} lang={book.language}>
      {children}
    </div>
  );

  const sheets: ReactNode[] = [];
  if (options.cover) {
    sheets.push(
      sheet(
        "cover",
        "Couverture",
        options.spreads ? (
          <div className={styles.halfRight}>
            <span />
            {single(null, <CoverContent book={book} size="print" />, "single")}
          </div>
        ) : (
          single(null, <CoverContent book={book} size="print" />, "single")
        ),
      ),
    );
  }
  const titlePage = single(null, <TitlePageContent book={book} />, "single");
  sheets.push(
    sheet(
      "title",
      "Page 1 · titre",
      options.spreads ? (
        <div className={styles.halfRight}>
          <span />
          {titlePage}
        </div>
      ) : (
        titlePage
      ),
    ),
  );
  book.spreads.forEach((s, i) => {
    const left = single(s, <IllustrationContent spread={s} size="print" showBrief={false} />, "left");
    const right = single(
      s,
      <div className={pageStyles.textBox}>
        <p className={pageStyles.text}>{s.text}</p>
      </div>,
      "right",
    );
    if (options.spreads) {
      sheets.push(sheet(s.id, `Pages ${i * 2 + 2}–${i * 2 + 3}`, <div className={`${pageStyles.spread} ${pageStyles.noFold}`} style={vars(s)}>{left}{right}</div>));
    } else {
      sheets.push(sheet(`${s.id}-l`, `Page ${i * 2 + 2}`, left));
      sheets.push(sheet(`${s.id}-r`, `Page ${i * 2 + 3}`, right));
    }
  });
  if (1 + book.spreads.length * 2 < pages && !options.spreads) {
    sheets.push(sheet("end", `Page ${pages} · fin`, single(null, null, "single")));
  }

  return (
    <div className={styles.screen}>
      <style>{`@page { size: ${sheetW}mm ${sheetH}mm; margin: 0; }`}</style>
      <div className={styles.toolbar}>
        <LinkButton href={`/livres/${book.id}`} variant="ghost" size="sm" iconOnly tip="Retour à l'éditeur" icon={<ArrowLeft />} />
        <span className={styles.toolTitle}>
          {book.title} · {sheetW} × {sheetH} mm
        </span>
        <div className={styles.options}>
          <Switch label="Couverture" checked={options.cover} onChange={(cover) => set({ cover })} />
          <Switch
            label="Doubles pages"
            hint="Une feuille par double page, pour relire ou partager à l'écran."
            checked={options.spreads}
            onChange={(spreads) => set({ spreads })}
          />
          <Switch
            label="Fonds perdus 3 mm"
            hint="Pour un imprimeur : l'image déborde de 3 mm, coupée au massicot."
            checked={options.bleed}
            disabled={options.spreads}
            onChange={(bleed) => set({ bleed })}
          />
        </div>
        <Button size="sm" icon={<Printer />} onClick={() => window.print()}>
          Imprimer / PDF
        </Button>
      </div>
      {warnings.length > 0 && (
        <div className={styles.warnings} role="status">
          <strong>À vérifier avant impression</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className={styles.howto}>Dans la fenêtre d&apos;impression : destination « Enregistrer au format PDF », marges « Aucune », graphiques d&apos;arrière-plan activés.</p>
      <div className={styles.sheets} lang={book.language}>
        {sheets}
      </div>
    </div>
  );
}
