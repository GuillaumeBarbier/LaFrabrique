import type { Metadata } from "next";
import { listBooks } from "@/server/services/books";
import { Library } from "./library";

export const metadata: Metadata = { title: "Bibliothèque" };
export const dynamic = "force-dynamic";

export default function LibraryPage() {
  return <Library books={listBooks("all")} archived={listBooks("archived")} />;
}
