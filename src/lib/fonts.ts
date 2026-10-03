// Pre-installed Google Fonts, self-hosted through Fontsource (ADR-0004).
// Adding a font: install `@fontsource/<package>`, add its CSS to `src/app/book-fonts.css`,
// then add one line here. Reasons for each choice: docs/design/02-typographies.md.

export type FontCategory = "reading" | "serif" | "display" | "handwriting" | "cursive";

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  reading: "Lecture",
  serif: "Album classique",
  display: "Titres",
  handwriting: "Manuscrites",
  cursive: "Cursive scolaire",
};

export interface CatalogFont {
  key: string;
  family: string;
  category: FontCategory;
  weights: readonly number[];
  note: string;
}

export const FONT_CATALOG: readonly CatalogFont[] = [
  { key: "andika", family: "Andika", category: "reading", weights: [400, 700], note: "Dessinée pour les lecteurs débutants : a et g simples, lettres bien distinctes." },
  { key: "lexend", family: "Lexend", category: "reading", weights: [400, 700], note: "Conçue pour réduire l'effort de lecture." },
  { key: "atkinson-hyperlegible-next", family: "Atkinson Hyperlegible Next", category: "reading", weights: [400, 700], note: "Lisibilité maximale, aussi pour les enfants malvoyants." },
  { key: "nunito", family: "Nunito", category: "reading", weights: [400, 700], note: "Arrondie et douce, très employée en jeunesse." },
  { key: "quicksand", family: "Quicksand", category: "reading", weights: [400, 700], note: "Ronde et légère, pour les textes courts." },
  { key: "comic-neue", family: "Comic Neue", category: "reading", weights: [400, 700], note: "L'esprit « Comic », en propre." },
  { key: "playpen-sans", family: "Playpen Sans", category: "reading", weights: [400, 700], note: "Manuscrite lisible, pensée pour l'apprentissage." },
  { key: "literata", family: "Literata", category: "serif", weights: [400, 700], note: "Serif de livre, confortable sur de longs textes." },
  { key: "lora", family: "Lora", category: "serif", weights: [400, 700], note: "Serif douce et contemporaine." },
  { key: "alegreya", family: "Alegreya", category: "serif", weights: [400, 700], note: "Calligraphique, ambiance conte." },
  { key: "gelasio", family: "Gelasio", category: "serif", weights: [400, 700], note: "Album classique, proche de Georgia." },
  { key: "fraunces", family: "Fraunces", category: "serif", weights: [400, 700], note: "Serif « molle » et rétro, très album illustré." },
  { key: "fredoka", family: "Fredoka", category: "display", weights: [400, 700], note: "Ronde et joyeuse : le titre par défaut." },
  { key: "baloo-2", family: "Baloo 2", category: "display", weights: [400, 700], note: "Ronde et grasse, se lit de loin." },
  { key: "chewy", family: "Chewy", category: "display", weights: [400], note: "Effet bonbon, pour les titres courts." },
  { key: "luckiest-guy", family: "Luckiest Guy", category: "display", weights: [400], note: "Bande dessinée, capitales seulement." },
  { key: "bubblegum-sans", family: "Bubblegum Sans", category: "display", weights: [400], note: "Rebondie et espiègle." },
  { key: "grandstander", family: "Grandstander", category: "display", weights: [400, 700], note: "Dynamique, faite pour les enfants." },
  { key: "sniglet", family: "Sniglet", category: "display", weights: [400, 800], note: "Ronde et compacte." },
  { key: "sour-gummy", family: "Sour Gummy", category: "display", weights: [400, 700], note: "Gélifiée, très ludique." },
  { key: "patrick-hand", family: "Patrick Hand", category: "handwriting", weights: [400], note: "Écriture à la main nette." },
  { key: "schoolbell", family: "Schoolbell", category: "handwriting", weights: [400], note: "Craie d'écolier." },
  { key: "gaegu", family: "Gaegu", category: "handwriting", weights: [400, 700], note: "Crayon d'enfant." },
  { key: "caveat", family: "Caveat", category: "handwriting", weights: [400, 700], note: "Notes manuscrites, bulles et légendes." },
  { key: "mali", family: "Mali", category: "handwriting", weights: [400, 700], note: "Manuscrite ronde et lisible." },
  { key: "short-stack", family: "Short Stack", category: "handwriting", weights: [400], note: "Écriture d'enfant appliquée." },
  { key: "playwrite-fr-moderne", family: "Playwrite FR Moderne", category: "cursive", weights: [400], note: "Cursive des cahiers français d'aujourd'hui." },
  { key: "playwrite-fr-trad", family: "Playwrite FR Trad", category: "cursive", weights: [400], note: "Cursive scolaire française traditionnelle." },
];

export const CUSTOM_FONT_PREFIX = "custom:";

export function isCustomFontKey(key: string): boolean {
  return key.startsWith(CUSTOM_FONT_PREFIX);
}

export function customFontCssFamily(id: string): string {
  return `lf-custom-${id}`;
}

export function findCatalogFont(key: string): CatalogFont | undefined {
  return FONT_CATALOG.find((f) => f.key === key);
}

/** CSS `font-family` value for a font key (catalogue key or `custom:<id>`). */
export function fontFamilyCss(key: string): string {
  if (isCustomFontKey(key)) {
    return `"${customFontCssFamily(key.slice(CUSTOM_FONT_PREFIX.length))}", system-ui, sans-serif`;
  }
  const font = findCatalogFont(key);
  return font ? `"${font.family}", system-ui, sans-serif` : "system-ui, sans-serif";
}

export const FONT_SAMPLE = "Il était une fois un petit renard qui rêvait de voler.";
