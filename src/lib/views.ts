// Normalised views of a character's reference images (ADR-0008), so that an illustrating
// agent finds "the back view" without guessing from free labels.

export const IMAGE_VIEWS = ["front", "three_quarter", "side_left", "side_right", "back", "face", "sheet", "other"] as const;
export type BaseView = (typeof IMAGE_VIEWS)[number];
/** A base view, or `expression:<name>` (e.g. expression:joie). */
export type ImageView = BaseView | `expression:${string}`;

export const VIEW_LABELS: Record<BaseView, string> = {
  front: "Face",
  three_quarter: "Trois-quarts",
  side_left: "Profil gauche",
  side_right: "Profil droit",
  back: "Dos",
  face: "Visage",
  sheet: "Planche",
  other: "Autre",
};

const EXPRESSION = /^expression:[\p{L}\p{N} _'-]{1,40}$/u;

export function isImageView(value: string): value is ImageView {
  return (IMAGE_VIEWS as readonly string[]).includes(value) || EXPRESSION.test(value);
}

function plain(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Guesses the view from a free label, French or English: "profil droit" → side_right,
 * "visage" → face, "expression joyeuse" → expression:joyeuse. Unknown → other.
 */
export function inferView(label: string): ImageView {
  const l = plain(label);
  if (!l) return "other";
  const expression = l.match(/^(?:expression|emotion|humeur)s?\s*:?\s*(.+)$/);
  if (expression?.[1]) return `expression:${expression[1].slice(0, 40)}`;
  if (/\b(planche|sheet|turnaround|model sheet|reference sheet)\b/.test(l)) return "sheet";
  if (/\b(trois quarts?|3\/4|three quarters?)\b/.test(l)) return "three_quarter";
  if (/\b(profil|side|profile)\b/.test(l)) {
    if (/\b(gauche|left)\b/.test(l)) return "side_left";
    if (/\b(droite?|right)\b/.test(l)) return "side_right";
    return "side_right";
  }
  if (/\b(dos|back|arriere|behind)\b/.test(l)) return "back";
  if (/\b(visage|gros plan|close ?up|portrait|tete|head)\b/.test(l)) return "face";
  if (/\b(face|front|de face|pied|full body|entier|en pied)\b/.test(l)) return "front";
  return "other";
}

/** Order in which references are listed: whole body first, details after. */
export function viewRank(view: string): number {
  const base = view.startsWith("expression:") ? "expression" : view;
  const order = ["front", "three_quarter", "side_left", "side_right", "back", "face", "expression", "sheet", "other"];
  const i = order.indexOf(base);
  return i === -1 ? order.length : i;
}

export function viewLabel(view: string): string {
  if (view.startsWith("expression:")) return `Expression ${view.slice("expression:".length)}`;
  return VIEW_LABELS[view as BaseView] ?? view;
}
