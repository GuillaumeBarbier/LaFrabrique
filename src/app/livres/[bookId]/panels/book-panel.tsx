"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ImageUp,
} from "lucide-react";
import Link from "next/link";
import { CoverContent, pageStyles, pageVars } from "@/components/book/pages";
import { ColorField, Dropzone, Segmented, Stepper } from "@/components/ui/controls";
import { Select, type SelectOption } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  BOOK_FORMATS,
  INK_SWATCHES,
  LANGUAGES,
  PAGE_SWATCHES,
  suggestedWordsPerSpread,
  type TextAlign,
  type TextValign,
  type Typography,
} from "@/lib/book";
import { errorMessage } from "@/lib/client";
import { FONT_CATALOG, FONT_CATEGORY_LABELS, fontFamilyCss } from "@/lib/fonts";
import type { Book, CustomFont } from "@/lib/types";
import { forbiddenLines, parseForbiddenLines, QUOTE_STYLE_LABELS, QUOTE_STYLE_RULES, QUOTE_STYLES, type QuoteStyle } from "@/lib/writing";
import styles from "../editor.module.css";
import { BoundTextArea, BoundTextField } from "./fields";

const AGES = [
  { value: "none", label: "Non précisé", min: null, max: null },
  { value: "0-3", label: "0 – 3 ans", min: 0, max: 3 },
  { value: "3-5", label: "3 – 5 ans", min: 3, max: 5 },
  { value: "4-7", label: "4 – 7 ans", min: 4, max: 7 },
  { value: "6-9", label: "6 – 9 ans", min: 6, max: 9 },
  { value: "8-12", label: "8 – 12 ans", min: 8, max: 12 },
] as const;

const BRIEF_PLACEHOLDER = `Histoire : …
Ton : tendre, drôle, rimé…
Personnages : nom, âge, caractère, apparence (pour l'illustration)
Style d'illustration : aquarelle, couleurs, références…
À éviter : …`;

export function fontOptions(customFonts: CustomFont[]): SelectOption<string>[] {
  return [
    ...FONT_CATALOG.map((f) => ({
      value: f.key,
      label: f.family,
      hint: f.note,
      group: FONT_CATEGORY_LABELS[f.category],
      style: { fontFamily: fontFamilyCss(f.key), fontSize: 16 },
    })),
    ...customFonts.map((f) => ({
      value: f.key,
      label: f.name,
      group: "Mes polices",
      style: { fontFamily: fontFamilyCss(f.key), fontSize: 16 },
    })),
  ];
}

export function BookPanel({
  book,
  customFonts,
  onUpdate,
  only,
  onUploadCover,
  onRemoveCover,
}: {
  book: Book;
  customFonts: CustomFont[];
  onUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  only?: "cover";
  onUploadCover: (file: File) => void;
  onRemoveCover: () => void;
}) {
  const toast = useToast();
  const t = book.typography;
  const save = (patch: Record<string, unknown>) =>
    void onUpdate(patch).catch((err: unknown) => toast.show(errorMessage(err), { tone: "danger" }));
  const typo = (patch: Partial<Typography>) => save({ typography: patch });
  const fonts = fontOptions(customFonts);
  const age = AGES.find((a) => a.min === book.ageMin && a.max === book.ageMax)?.value ?? "none";

  const cover = (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Couverture</h3>
      <div className={styles.row}>
        <div className={`${pageStyles.page} ${pageStyles.single}`} style={{ ...pageVars(book.format, t), boxShadow: "var(--shadow-2)" }}>
          <CoverContent book={book} size="thumb" />
        </div>
        <Dropzone accept="image/*" onFile={onUploadCover} label="Image de couverture">
          <ImageUp size={20} aria-hidden />
          <span>{book.cover ? "Remplacer" : "Image de couverture"}</span>
        </Dropzone>
      </div>
      {book.cover ? (
        <button type="button" className={styles.linkish} onClick={onRemoveCover}>
          Retirer l&apos;image (couverture typographique)
        </button>
      ) : (
        <p className={styles.words}>Sans image : titre composé dans la police du titre.</p>
      )}
    </section>
  );

  if (only === "cover") {
    return (
      <>
        {cover}
        <hr className={styles.hr} />
        <BoundTextField label="Titre" value={book.title} onSave={(title) => title.trim() && save({ title })} />
        <BoundTextField label="Sous-titre" value={book.subtitle} onSave={(subtitle) => save({ subtitle })} />
        <div className={styles.row}>
          <BoundTextField label="Texte" value={book.author} onSave={(author) => save({ author })} />
          <BoundTextField label="Illustrations" value={book.illustrator} onSave={(illustrator) => save({ illustrator })} />
        </div>
      </>
    );
  }

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Livre</h3>
        <BoundTextField label="Titre" value={book.title} onSave={(title) => title.trim() && save({ title })} />
        <BoundTextField label="Sous-titre" value={book.subtitle} onSave={(subtitle) => save({ subtitle })} />
        <div className={styles.row}>
          <BoundTextField label="Texte" value={book.author} onSave={(author) => save({ author })} />
          <BoundTextField label="Illustrations" value={book.illustrator} onSave={(illustrator) => save({ illustrator })} />
        </div>
        <div className={styles.row}>
          <Select
            label="Âge"
            value={age}
            onChange={(v) => {
              const a = AGES.find((x) => x.value === v);
              if (a) save({ ageMin: a.min, ageMax: a.max });
            }}
            options={AGES.map((a) => ({ value: a.value, label: a.label }))}
          />
          <Select
            label="Langue"
            hint="Césure et typographie (guillemets, espaces) suivent la langue."
            value={book.language}
            onChange={(language) => save({ language })}
            options={LANGUAGES.map((l) => ({ value: l.key, label: l.label }))}
          />
        </div>
        <Select
          label="Format"
          hint="Taille d'une page. Les illustrations se recadrent d'elles-mêmes ; vérifier leur cadrage après un changement."
          value={book.format}
          onChange={(format) => save({ format })}
          options={BOOK_FORMATS.map((f) => ({ value: f.key, label: f.label }))}
        />
        <Stepper
          label="Mots par page (cible)"
          hint="Repère pour l'agent et le compteur. Proposé selon l'âge ; modifiable."
          value={book.wordsPerSpread ?? suggestedWordsPerSpread(book.ageMin) ?? 40}
          onChange={(wordsPerSpread) => save({ wordsPerSpread })}
          step={5}
          min={5}
          max={400}
        />
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Brief pour l&apos;agent</h3>
        <BoundTextArea
          aria-label="Brief du livre"
          hint="Lu par l'agent avant chaque intervention : c'est la mémoire du livre."
          label="Histoire, ton, personnages, style"
          rows={9}
          placeholder={BRIEF_PLACEHOLDER}
          value={book.brief}
          onSave={(brief) => save({ brief })}
        />
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Écriture et style</h3>
        {book.series && (
          <p className={styles.words} title="Personnages, style et règles de la série valent pour ce livre ; ceux saisis ici s'y ajoutent.">
            Série « {book.series.title} »
          </p>
        )}
        <Select<QuoteStyle | "inherit">
          label="Dialogues"
          hint={QUOTE_STYLE_RULES[book.effective.quoteStyle]}
          value={book.quoteStyle ?? "inherit"}
          onChange={(v) => save({ quoteStyle: v === "inherit" ? null : v })}
          options={[
            { value: "inherit", label: book.series ? "Comme la série" : "Selon la langue" },
            ...QUOTE_STYLES.map((q) => ({ value: q, label: QUOTE_STYLE_LABELS[q] })),
          ]}
        />
        <BoundTextArea
          label="Règles d'écriture"
          hint="Lues par l'agent avant d'écrire et rappelées dans ses consignes."
          rows={4}
          placeholder={"Toujours « Mama », jamais « Maman »\nPhrases courtes, présent de narration"}
          value={book.writingRules}
          onSave={(writingRules) => save({ writingRules })}
        />
        <BoundTextArea
          label="Mots à éviter"
          hint="Un par ligne, avec le remplaçant après une flèche. Vérifiés par check_text."
          rows={3}
          placeholder="Maman → Mama"
          value={forbiddenLines(book.forbiddenWords)}
          onSave={(text) => save({ forbiddenWords: parseForbiddenLines(text) })}
        />
        <BoundTextArea
          label="Style d'illustration"
          hint="Donné au générateur d'images avec les références des personnages (get_references)."
          rows={3}
          placeholder="Aquarelle douce, contours encrés, palette pastel…"
          value={book.illustrationStyle}
          onSave={(illustrationStyle) => save({ illustrationStyle })}
        />
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Typographie</h3>
        <Select label="Police du titre" value={t.titleFont} onChange={(titleFont) => typo({ titleFont })} options={fonts} />
        <Select label="Police du texte" value={t.bodyFont} onChange={(bodyFont) => typo({ bodyFont })} options={fonts} />
        <Link href="/parametres/typographies" className={styles.linkish}>
          Ajouter une police…
        </Link>
        <div className={styles.row}>
          <Stepper label="Texte" value={t.bodySizePt} onChange={(bodySizePt) => typo({ bodySizePt })} step={1} min={8} max={72} format={(v) => `${v} pt`} />
          <Stepper label="Titre" value={t.titleSizePt} onChange={(titleSizePt) => typo({ titleSizePt })} step={2} min={12} max={144} format={(v) => `${v} pt`} />
        </div>
        <Stepper
          label="Interligne"
          value={t.lineHeight}
          onChange={(lineHeight) => typo({ lineHeight })}
          step={0.05}
          min={1}
          max={2.5}
          format={(v) => v.toFixed(2)}
        />
        <div className={styles.inline}>
          <Segmented<TextAlign>
            label="Alignement par défaut"
            small
            value={t.textAlign}
            onChange={(textAlign) => typo({ textAlign })}
            segments={[
              { value: "left", label: "À gauche", icon: <AlignLeft />, iconOnly: true },
              { value: "center", label: "Centré", icon: <AlignCenter />, iconOnly: true },
              { value: "right", label: "À droite", icon: <AlignRight />, iconOnly: true },
            ]}
          />
          <Segmented<TextValign>
            label="Position verticale par défaut"
            small
            value={t.textValign}
            onChange={(textValign) => typo({ textValign })}
            segments={[
              { value: "top", label: "En haut", icon: <AlignVerticalJustifyStart />, iconOnly: true },
              { value: "middle", label: "Au milieu", icon: <AlignVerticalJustifyCenter />, iconOnly: true },
              { value: "bottom", label: "En bas", icon: <AlignVerticalJustifyEnd />, iconOnly: true },
            ]}
          />
        </div>
        <ColorField label="Couleur du texte" swatches={INK_SWATCHES} value={t.textColor} onChange={(c) => c && typo({ textColor: c })} />
        <ColorField label="Couleur des pages" swatches={PAGE_SWATCHES} value={t.pageColor} onChange={(c) => c && typo({ pageColor: c })} />
      </section>

      <hr className={styles.hr} />

      {cover}
    </>
  );
}
