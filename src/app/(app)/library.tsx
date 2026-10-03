"use client";

import { Archive, ArchiveRestore, BookOpen, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookCover } from "@/components/book/book-cover";
import { StatusBadge } from "@/components/book/status-badge";
import { Button } from "@/components/ui/button";
import { Badge, Dialog, EmptyState, Menu, Segmented, Stepper } from "@/components/ui/controls";
import { TextField } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { BOOK_FORMATS, DEFAULT_FORMAT } from "@/lib/book";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import type { Book, BookSummary } from "@/lib/types";
import page from "./page.module.css";
import styles from "./library.module.css";

type Filter = "all" | "active" | "done" | "archived";

export function Library({ books, archived }: { books: BookSummary[]; archived: BookSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<BookSummary | null>(null);

  // The agent may have worked while this tab was hidden.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const shown = useMemo(() => {
    const source = filter === "archived" ? archived : books;
    const byFilter = source.filter((b) => (filter === "active" ? b.status !== "done" : filter === "done" ? b.status === "done" : true));
    const q = query.trim().toLowerCase();
    return q ? byFilter.filter((b) => `${b.title} ${b.subtitle}`.toLowerCase().includes(q)) : byFilter;
  }, [books, archived, filter, query]);

  async function setArchived(book: BookSummary, value: boolean) {
    try {
      await apiFetch(`/api/v1/books/${book.id}`, { method: "PATCH", json: { archived: value } });
      router.refresh();
      toast.show(value ? `« ${book.title} » archivé` : `« ${book.title} » ressorti`, {
        action: { label: "Annuler", onClick: () => void setArchived(book, !value) },
      });
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function remove(book: BookSummary) {
    try {
      await apiFetch(`/api/v1/books/${book.id}`, { method: "DELETE" });
      setToDelete(null);
      router.refresh();
      toast.show(`« ${book.title} » supprimé`);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const counts = {
    all: books.length,
    active: books.filter((b) => b.status !== "done").length,
    done: books.filter((b) => b.status === "done").length,
    archived: archived.length,
  };

  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1 className={page.title}>Bibliothèque</h1>
        <Button icon={<Plus />} onClick={() => setCreating(true)}>
          Nouveau livre
        </Button>
      </header>

      <div className={page.toolbar}>
        <Segmented<Filter>
          label="Filtrer les livres"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: "all", label: "Tous", count: counts.all },
            { value: "active", label: "En cours", count: counts.active },
            { value: "done", label: "Terminés", count: counts.done },
            { value: "archived", label: "Archivés", count: counts.archived },
          ]}
        />
        <TextField
          fieldClassName={page.search}
          aria-label="Rechercher un livre"
          placeholder="Rechercher"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {shown.length === 0 && filter === "all" && !query ? (
        <EmptyState
          title="Aucun livre pour l'instant"
          text="Un titre suffit pour commencer : l'agent peut ensuite écrire, vous illustrez, ou l'inverse."
          action={
            <Button icon={<Plus />} onClick={() => setCreating(true)}>
              Nouveau livre
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Rien ici" />
      ) : (
        <ul className={styles.grid} role="list">
          {filter !== "archived" && !query && (
            <li>
              <button type="button" className={styles.newCard} onClick={() => setCreating(true)}>
                <Plus size={22} aria-hidden />
                Nouveau livre
              </button>
            </li>
          )}
          {shown.map((b) => (
            <li key={b.id} className={styles.card}>
              <Link href={`/livres/${b.id}`} className={styles.coverLink} aria-label={`Ouvrir « ${b.title} »`}>
                <BookCover
                  title={b.title}
                  format={b.format}
                  imageUrl={b.coverThumbUrl}
                  titleFont={b.titleFont}
                  pageColor={b.pageColor}
                  textColor={b.textColor}
                />
              </Link>
              <div className={styles.info}>
                <div className={styles.titleRow}>
                  <Link href={`/livres/${b.id}`} className={styles.bookTitle}>
                    {b.title}
                  </Link>
                  <Menu
                    label={`Actions pour « ${b.title} »`}
                    items={[
                      { label: "Ouvrir", icon: <Pencil />, onSelect: () => router.push(`/livres/${b.id}`) },
                      { label: "Lire", icon: <BookOpen />, onSelect: () => router.push(`/livres/${b.id}/lire`) },
                      b.archivedAt
                        ? { label: "Ressortir des archives", icon: <ArchiveRestore />, onSelect: () => void setArchived(b, false) }
                        : { label: "Archiver", icon: <Archive />, onSelect: () => void setArchived(b, true) },
                      { label: "Supprimer…", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setToDelete(b) },
                    ]}
                  />
                </div>
                <div className={styles.statusRow}>
                  <StatusBadge status={b.status} />
                  {b.openRequests.forHuman > 0 && (
                    <Badge tone="agent" title="Messages de l'agent en attente de réponse">
                      <MessageCircle size={12} aria-hidden /> {b.openRequests.forHuman}
                    </Badge>
                  )}
                </div>
                {b.spreadCount > 0 && (
                  <div
                    className={styles.progress}
                    role="progressbar"
                    aria-label="Doubles pages complètes"
                    aria-valuemin={0}
                    aria-valuemax={b.spreadCount}
                    aria-valuenow={b.completeSpreads}
                  >
                    <span style={{ width: `${(b.completeSpreads / b.spreadCount) * 100}%` }} />
                  </div>
                )}
                <span className={styles.meta}>
                  {b.completeSpreads}/{b.spreadCount} doubles pages · {relativeTime(b.updatedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateBookDialog open={creating} onClose={() => setCreating(false)} />

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer ce livre ?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Garder
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => toDelete && void remove(toDelete)}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <p>
          « {toDelete?.title} », ses illustrations, ses échanges et son historique disparaîtront. Archiver le garde à
          l&apos;abri sans l&apos;afficher.
        </p>
      </Dialog>
    </div>
  );
}

function CreateBookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [spreads, setSpreads] = useState(12);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const book = await apiFetch<Book>("/api/v1/books", { method: "POST", json: { title: title.trim(), format, spreads } });
      router.push(`/livres/${book.id}`);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nouveau livre">
      <form id="create-book" onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="Titre" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        <div className={styles.formRow}>
          <Select
            label="Format"
            hint="Taille d'une page. Modifiable plus tard."
            value={format}
            onChange={setFormat}
            options={BOOK_FORMATS.map((f) => ({ value: f.key, label: f.label }))}
          />
          <Stepper
            label="Doubles pages"
            hint="Illustration à gauche, texte à droite. 12 à 14 pour un album classique."
            value={spreads}
            onChange={setSpreads}
            step={1}
            min={0}
            max={40}
          />
        </div>
        <Button type="submit" loading={busy} disabled={!title.trim()}>
          Créer le livre
        </Button>
      </form>
    </Dialog>
  );
}
