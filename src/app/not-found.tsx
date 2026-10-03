import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/controls";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
      <EmptyState title="Page introuvable" action={<LinkButton href="/">Bibliothèque</LinkButton>} />
    </main>
  );
}
