import { notFound } from "next/navigation";
import type { Book } from "@/lib/types";
import { getBook } from "./services/books";
import { HttpError } from "./util";

/** For pages: the book, or the 404 page. */
export function loadBookOr404(bookId: string): Book {
  try {
    return getBook(bookId);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
}
