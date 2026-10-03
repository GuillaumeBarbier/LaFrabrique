"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowUp,
  Download,
  ImageUp,
  MessageSquarePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorField, Dropzone, Segmented, Stepper } from "@/components/ui/controls";
import {
  effectiveDpi,
  getFormat,
  PAGE_SWATCHES,
  PRINT_DPI,
  requiredPixels,
  suggestedWordsPerSpread,
  type IllustrationFit,
  type TextAlign,
  type TextValign,
} from "@/lib/book";
import type { Book, Spread } from "@/lib/types";
import type { SpreadPatch } from "../use-book";
import styles from "../editor.module.css";
import { BoundTextArea } from "./fields";

export function PagePanel({
  book,
  spread,
  index,
  onEdit,
  onUpload,
  onRemoveIllustration,
  onDelete,
  onMove,
  onInsertAfter,
  onAsk,
}: {
  book: Book;
  spread: Spread;
  index: number;
  onEdit: (patch: SpreadPatch) => void;
  onUpload: (file: File) => void;
  onRemoveIllustration: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onInsertAfter: () => void;
  onAsk: () => void;
}) {
  const t = book.typography;
  const format = getFormat(book.format);
  const target = book.wordsPerSpread ?? suggestedWordsPerSpread(book.ageMin);
  const dpi = spread.illustration?.width && spread.illustration.height ? effectiveDpi(format, spread.illustration.width, spread.illustration.height) : null;
  const need = requiredPixels(format);

  /** A value equal to the book's goes back to "follow the book" (null). */
  function override<K extends keyof SpreadPatch>(key: K, value: SpreadPatch[K], bookValue: unknown) {
    onEdit({ [key]: value === bookValue ? null : value } as SpreadPatch);
  }

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Illustration · page {index * 2 + 2}</h3>
        <BoundTextArea
          label="Brief d'illustration"
          hint="Ce que l'image doit montrer : scène, personnages, cadrage, ambiance. L'agent et l'illustrateur s'en servent."
          rows={4}
          placeholder="Le renard, de dos, regarde les oies s'envoler au-dessus de l'étang. Lumière d'automne."
          value={spread.illustrationBrief}
          onSave={(illustrationBrief) => onEdit({ illustrationBrief })}
        />
        {spread.illustration ? (
          <>
            <Segmented<IllustrationFit>
              label="Cadrage"
              small
              value={spread.illustrationFit}
              onChange={(illustrationFit) => onEdit({ illustrationFit })}
              segments={[
                { value: "cover", label: "Remplir la page" },
                { value: "contain", label: "Image entière" },
              ]}
            />
            <p className={styles.words} data-over={dpi !== null && dpi < PRINT_DPI}>
              {spread.illustration.width} × {spread.illustration.height} px · {dpi} dpi à l&apos;impression
              {dpi !== null && dpi < PRINT_DPI && ` (viser ${need.width} × ${need.height} px)`}
            </p>
            <div className={styles.inline}>
              <a className={styles.linkish} href={spread.illustration.url} download>
                <Download size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Original
              </a>
              <button type="button" className={styles.linkish} onClick={onRemoveIllustration}>
                Retirer l&apos;illustration
              </button>
            </div>
          </>
        ) : (
          <Dropzone accept="image/*" onFile={onUpload} label="Téléverser l'illustration">
            <ImageUp size={22} aria-hidden />
            <span>Déposer une image ici</span>
            <span className={styles.words}>
              {need.width} × {need.height} px pour 300 dpi
            </span>
          </Dropzone>
        )}
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Texte · page {index * 2 + 3}</h3>
        <p className={styles.words} data-over={target !== null && spread.wordCount > target}>
          {spread.wordCount} mot{spread.wordCount > 1 ? "s" : ""}
          {target !== null && ` · cible ${target}`}
        </p>
        <Segmented<TextAlign>
          label="Alignement"
          small
          value={spread.textAlign ?? t.textAlign}
          onChange={(v) => override("textAlign", v, t.textAlign)}
          segments={[
            { value: "left", label: "À gauche", icon: <AlignLeft />, iconOnly: true },
            { value: "center", label: "Centré", icon: <AlignCenter />, iconOnly: true },
            { value: "right", label: "À droite", icon: <AlignRight />, iconOnly: true },
          ]}
        />
        <Segmented<TextValign>
          label="Position verticale"
          small
          value={spread.textValign ?? t.textValign}
          onChange={(v) => override("textValign", v, t.textValign)}
          segments={[
            { value: "top", label: "En haut", icon: <AlignVerticalJustifyStart />, iconOnly: true },
            { value: "middle", label: "Au milieu", icon: <AlignVerticalJustifyCenter />, iconOnly: true },
            { value: "bottom", label: "En bas", icon: <AlignVerticalJustifyEnd />, iconOnly: true },
          ]}
        />
        <Stepper
          label="Taille du texte"
          hint="Propre à cette page. Revenir à la taille du livre la remet par défaut."
          value={spread.textSizePt ?? t.bodySizePt}
          onChange={(v) => override("textSizePt", v, t.bodySizePt)}
          step={1}
          min={8}
          max={72}
          format={(v) => `${v} pt`}
        />
        <ColorField
          label="Couleur de la page"
          swatches={PAGE_SWATCHES}
          value={spread.pageColor}
          allowReset
          onChange={(pageColor) => onEdit({ pageColor })}
        />
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <BoundTextArea
          label="Notes"
          hint="Non imprimées. Lues par l'agent."
          rows={3}
          value={spread.notes}
          onSave={(notes) => onEdit({ notes })}
        />
        <Button variant="secondary" size="sm" icon={<MessageSquarePlus />} onClick={onAsk}>
          Demander à l&apos;agent
        </Button>
      </section>

      <hr className={styles.hr} />

      <section className={styles.inline}>
        <Button variant="ghost" size="sm" iconOnly tip="Avancer" icon={<ArrowUp />} disabled={index === 0} onClick={() => onMove(-1)} />
        <Button variant="ghost" size="sm" iconOnly tip="Reculer" icon={<ArrowDown />} disabled={index === book.spreads.length - 1} onClick={() => onMove(1)} />
        <Button variant="ghost" size="sm" icon={<Plus />} onClick={onInsertAfter}>
          Insérer après
        </Button>
        <Button variant="danger" size="sm" icon={<Trash2 />} onClick={onDelete}>
          Supprimer
        </Button>
      </section>
    </>
  );
}
