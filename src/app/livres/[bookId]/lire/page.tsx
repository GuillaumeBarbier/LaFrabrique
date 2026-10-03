import type { Metadata } from "next";
import { loadBookOr404 } from "@/server/load";
import { Reader } from "./reader";

type Props = { params: Promise<{ bookId: string }> };

export const metadata: Metadata = { title: "Lecture" };

export default async function ReadPage({ params }: Props) {
  const { bookId } = await params;
  return <Reader book={loadBookOr404(bookId)} />;
}
