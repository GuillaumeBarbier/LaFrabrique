/* eslint-disable @next/next/no-img-element -- private, authenticated assets: no image optimiser. */
import type { CSSProperties } from "react";
import { getFormat } from "@/lib/book";
import { fontFamilyCss } from "@/lib/fonts";
import styles from "./cover.module.css";

interface Props {
  title: string;
  format: string;
  imageUrl: string | null;
  titleFont: string;
  pageColor: string;
  textColor: string;
}

/** A cover at the book's single-page ratio: the image, or a typographic cover. */
export function BookCover({ title, format, imageUrl, titleFont, pageColor, textColor }: Props) {
  const f = getFormat(format);
  const style = {
    aspectRatio: `${f.widthMm} / ${f.heightMm}`,
    "--page-color": pageColor,
    "--text-color": textColor,
  } as CSSProperties;
  return (
    <div className={styles.cover} style={style}>
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.typo} style={{ fontFamily: fontFamilyCss(titleFont) }}>
          {title}
        </span>
      )}
    </div>
  );
}
