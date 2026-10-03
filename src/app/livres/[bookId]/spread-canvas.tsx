"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IllustrationContent, pageStyles, pageVars, CoverContent } from "@/components/book/pages";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { effectiveDpi, getFormat, PRINT_DPI } from "@/lib/book";
import type { Book, Spread } from "@/lib/types";
import styles from "./editor.module.css";

/** Plain-text editable paragraph that never fights the caret (uncontrolled while focused). */
function EditableText({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.innerText !== value) el.textContent = value;
  }, [value]);
  return (
    <p
      ref={ref}
      className={`${pageStyles.text} ${pageStyles.editable}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Texte de la page de droite"
      data-placeholder={placeholder}
      spellCheck
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, ""))}
      onBlur={(e) => {
        if (e.currentTarget.innerText.replace(/\n$/, "") !== latest.current) e.currentTarget.textContent = latest.current;
      }}
    />
  );
}

export function useFileDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      },
    },
  };
}

function DpiBadge({ book, width, height }: { book: Book; width: number | null; height: number | null }) {
  if (!width || !height) return null;
  const dpi = effectiveDpi(getFormat(book.format), width, height);
  if (dpi >= PRINT_DPI) return null;
  return (
    <span className={styles.dpi}>
      <Badge tone="warning" title={`Résolution d'impression : ${dpi} dpi pour ${PRINT_DPI} conseillés. Nette à l'écran, possiblement floue imprimée.`}>
        {dpi} dpi
      </Badge>
    </span>
  );
}

function ImagePicker({ onFile, label }: { onFile: (file: File) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="gold" icon={<ImageUp />} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

export function SpreadCanvas({
  book,
  spread,
  uploading,
  onText,
  onUpload,
  onRemoveIllustration,
}: {
  book: Book;
  spread: Spread;
  uploading: boolean;
  onText: (text: string) => void;
  onUpload: (file: File) => void;
  onRemoveIllustration: () => void;
}) {
  const drop = useFileDrop(onUpload);
  const f = getFormat(book.format);
  return (
    <div className={styles.canvasWrap} style={{ "--ratio": (f.widthMm * 2) / f.heightMm } as React.CSSProperties}>
      <div className={pageStyles.spread} style={pageVars(book.format, book.typography, spread)} lang={book.language}>
        <div className={`${styles.leftPage} ${pageStyles.left}`} data-over={drop.over} {...drop.handlers}>
          <IllustrationContent spread={spread} size="web" />
          <DpiBadge book={book} width={spread.illustration?.width ?? null} height={spread.illustration?.height ?? null} />
          <div className={styles.pageTools} data-visible={!spread.illustration}>
            <ImagePicker onFile={onUpload} label={spread.illustration ? "Remplacer" : "Téléverser"} />
            {spread.illustration && (
              <Button size="sm" variant="secondary" iconOnly tip="Retirer l'illustration" tipUp icon={<Trash2 />} onClick={onRemoveIllustration} />
            )}
          </div>
          {uploading && <div className={styles.uploading}>Envoi…</div>}
        </div>
        <div className={`${pageStyles.page} ${pageStyles.right}`}>
          <div className={pageStyles.textBox}>
            <EditableText value={spread.text} onChange={onText} placeholder="Il était une fois…" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CoverCanvas({ book, uploading, onUpload, onRemove }: { book: Book; uploading: boolean; onUpload: (file: File) => void; onRemove: () => void }) {
  const drop = useFileDrop(onUpload);
  const f = getFormat(book.format);
  return (
    <div className={styles.canvasWrap} data-single="true" style={{ "--ratio": f.widthMm / f.heightMm } as React.CSSProperties}>
      <div
        className={`${styles.leftPage} ${pageStyles.single}`}
        style={pageVars(book.format, book.typography)}
        lang={book.language}
        data-over={drop.over}
        {...drop.handlers}
      >
        <CoverContent book={book} size="web" />
        <DpiBadge book={book} width={book.cover?.width ?? null} height={book.cover?.height ?? null} />
        <div className={styles.pageTools} data-visible={!book.cover}>
          <ImagePicker onFile={onUpload} label={book.cover ? "Remplacer" : "Image de couverture"} />
          {book.cover && <Button size="sm" variant="secondary" iconOnly tip="Retirer l'image" tipUp icon={<Trash2 />} onClick={onRemove} />}
        </div>
        {uploading && <div className={styles.uploading}>Envoi…</div>}
      </div>
    </div>
  );
}
