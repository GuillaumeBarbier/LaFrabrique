import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countWords, effectiveDpi, getFormat, printedPageCount, requiredPixels } from "./book";
import { FONT_CATALOG, fontFamilyCss } from "./fonts";

describe("book helpers", () => {
  it("counts French words", () => {
    expect(countWords("L'ours brun s'est endormi — aujourd'hui !")).toBe(5);
    expect(countWords("   ")).toBe(0);
  });

  it("paginates with a title page on the recto", () => {
    expect(printedPageCount(12)).toEqual({ pages: 26, multipleOf4: false });
    expect(printedPageCount(13)).toEqual({ pages: 28, multipleOf4: true });
  });

  it("computes print resolution with bleed", () => {
    const format = getFormat("square-200");
    expect(requiredPixels(format)).toEqual({ width: 2433, height: 2433 });
    expect(effectiveDpi(format, 2433, 2433)).toBe(300);
    expect(effectiveDpi(format, 1200, 2433)).toBeLessThan(300);
  });
});

describe("font catalogue", () => {
  it("matches the Fontsource imports, weight by weight", () => {
    const imports = fs.readFileSync(path.join(__dirname, "../app/book-fonts.ts"), "utf8");
    for (const font of FONT_CATALOG) {
      for (const weight of font.weights) {
        expect(imports).toContain(`@fontsource/${font.key}/latin-${weight}.css`);
      }
    }
  });

  it("maps keys to CSS families", () => {
    expect(fontFamilyCss("andika")).toContain('"Andika"');
    expect(fontFamilyCss("custom:abc")).toContain('"lf-custom-abc"');
  });
});
