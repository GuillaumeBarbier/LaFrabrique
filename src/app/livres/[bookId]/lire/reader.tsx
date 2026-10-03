"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoverContent, SinglePage, SpreadView } from "@/components/book/pages";
import { getFormat } from "@/lib/book";
import type { Book } from "@/lib/types";
import styles from "./reader.module.css";

/** Full-screen reading (F1.10): the cover, then each spread, as a child will see them. */
export function Reader({ book }: { book: Book }) {
  const router = useRouter();
  const [index, setIndex] = useState(0); // 0 = cover
  const [direction, setDirection] = useState(1);
  const startX = useRef<number | null>(null);
  const total = book.spreads.length + 1;
  const f = getFormat(book.format);

  const go = useCallback(
    (delta: number) => {
      setDirection(delta);
      setIndex((i) => Math.min(Math.max(i + delta, 0), total - 1));
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        router.push(`/livres/${book.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router, book.id]);

  const spread = index > 0 ? book.spreads[index - 1] : null;

  return (
    <div
      className={styles.reader}
      onPointerDown={(e) => {
        startX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={styles.top}>
        <span>
          {index === 0 ? "Couverture" : `${index} / ${total - 1}`} · {book.title}
        </span>
        <Link href={`/livres/${book.id}`} className={styles.close}>
          <X size={16} aria-hidden /> Fermer
        </Link>
      </div>

      <button type="button" className={`${styles.nav} ${styles.prev}`} aria-label="Page précédente" onClick={() => go(-1)} />
      <button type="button" className={`${styles.nav} ${styles.next}`} aria-label="Page suivante" onClick={() => go(1)} />

      <div
        key={index}
        className={[styles.stage, !spread && styles.single].filter(Boolean).join(" ")}
        style={{ "--ratio": (f.widthMm * 2) / f.heightMm, "--from": `${direction * 24}px` } as React.CSSProperties}
      >
        {spread ? (
          <SpreadView book={book} spread={spread} size="web" showBrief={false} />
        ) : (
          <SinglePage book={book}>
            <CoverContent book={book} size="web" />
          </SinglePage>
        )}
      </div>

      <div className={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            className={styles.dot}
            aria-label={i === 0 ? "Couverture" : `Double page ${i}`}
            aria-current={i === index}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
