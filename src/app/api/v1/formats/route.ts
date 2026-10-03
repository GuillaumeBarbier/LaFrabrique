import { BOOK_FORMATS, BOOK_STATUSES, LANGUAGES, requiredPixels, STATUS_LABELS } from "@/lib/book";
import { api } from "@/server/http";

export const GET = api("read", () => ({
  formats: BOOK_FORMATS.map((f) => ({ ...f, printPixels: requiredPixels(f) })),
  statuses: BOOK_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  languages: LANGUAGES,
}));
