import type { Metadata } from "next";
import { loadBookOr404 } from "@/server/load";
import { listCustomFonts } from "@/server/services/fonts";
import { Editor } from "./editor";

type Props = { params: Promise<{ bookId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { bookId } = await params;
  return { title: loadBookOr404(bookId).title };
}

export default async function EditorPage({ params }: Props) {
  const { bookId } = await params;
  return <Editor key={bookId} initial={loadBookOr404(bookId)} customFonts={listCustomFonts()} />;
}
