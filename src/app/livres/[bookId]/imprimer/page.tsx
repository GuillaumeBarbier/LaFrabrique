import type { Metadata } from "next";
import { loadBookOr404 } from "@/server/load";
import { PrintView } from "./print-view";

type Props = {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Impression" };

export default async function PrintPage({ params, searchParams }: Props) {
  const { bookId } = await params;
  const q = await searchParams;
  const book = loadBookOr404(bookId);
  return <PrintView book={book} options={{ bleed: q.fondsPerdus === "1", cover: q.couverture !== "0", spreads: q.planches === "1" }} />;
}
