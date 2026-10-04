import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/controls";
import { Reader } from "@/components/book/reader";
import { recordView, sharedBook, sharedFontsCss } from "@/server/services/shares";

// The viewer behind a reading link (ADR-0009): no account, no workshop, just the book.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const shared = sharedBook(token);
  // No description, no image: a messaging app's preview shows the title at most.
  return { title: { absolute: shared ? shared.book.title : "La Fabrique" }, robots: { index: false, follow: false } };
}

export default async function SharedReadPage({ params }: Props) {
  const { token } = await params;
  const shared = sharedBook(token);
  if (!shared) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <EmptyState title="Ce lien n'est plus valide" text="Demander un nouveau lien à la personne qui l'a envoyé." />
      </main>
    );
  }
  recordView(token);
  const css = sharedFontsCss(token, shared.customFontIds);
  return (
    <>
      {css && <style>{css}</style>}
      <Reader book={shared.book} closeHref={null} />
    </>
  );
}
