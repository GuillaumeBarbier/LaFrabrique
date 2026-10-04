"use client";

import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Plus, Printer, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pageStyles, pageVars, SpreadView, CoverContent } from "@/components/book/pages";
import { STATUS_TONES } from "@/components/book/status-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { BOOK_STATUSES, type BookStatus, getFormat, printedPageCount, STATUS_LABELS } from "@/lib/book";
import { apiFetch, errorMessage, uploadFile } from "@/lib/client";
import type { ActivityEntry, Book, Comment, CustomFont, Spread } from "@/lib/types";
import { AvatarStack, CharacterBoard, CharacterPanel } from "./characters";
import characterStyles from "./characters.module.css";
import styles from "./editor.module.css";
import { BookPanel } from "./panels/book-panel";
import { CommentsPanel } from "./panels/comments-panel";
import { HistoryPanel } from "./panels/history-panel";
import { PagePanel } from "./panels/page-panel";
import { ShareButton } from "./share";
import { CoverCanvas, SpreadCanvas } from "./spread-canvas";
import { useBook } from "./use-book";

type Tab = "page" | "book" | "comments" | "history";
const COVER = "cover";
const CHARACTERS = "characters";

const STATUS_DOT: Record<string, string> = {
  neutral: "var(--color-text-3)",
  signal: "var(--color-signal)",
  gold: "var(--color-accent)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
};

export function Editor({ initial, customFonts }: { initial: Book; customFonts: CustomFont[] }) {
  const toast = useToast();
  const { book, applyBook, reload, editSpread, updateBook, conflict, resolveConflict, saving, live, eventTick } = useBook(initial);
  const [chosen, setSelected] = useState<string>(initial.spreads[0]?.id ?? COVER);
  const [tab, setTab] = useState<Tab>("page");
  const [uploading, setUploading] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; where: "before" | "after" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chosenCharacter, setCharacter] = useState<string | null>(initial.characters[0]?.id ?? null);

  // A spread deleted elsewhere falls back to the first one (our own deletions pick a neighbour).
  const selected =
    chosen === COVER || chosen === CHARACTERS || book.spreads.some((s) => s.id === chosen) ? chosen : (book.spreads[0]?.id ?? COVER);
  const character = book.characters.find((c) => c.id === chosenCharacter) ?? book.characters[0] ?? null;
  const spread = book.spreads.find((s) => s.id === selected) ?? null;
  const index = spread ? book.spreads.indexOf(spread) : -1;

  // Exchanges and history follow the live events.
  const loadComments = useCallback(
    () =>
      apiFetch<{ comments: Comment[] }>(`/api/v1/books/${book.id}/comments`)
        .then((r) => setComments(r.comments))
        .catch(() => {}),
    [book.id],
  );
  const loadActivity = useCallback(
    () =>
      apiFetch<{ activity: ActivityEntry[] }>(`/api/v1/books/${book.id}/activity?limit=150`)
        .then((r) => setActivity(r.activity))
        .catch(() => {}),
    [book.id],
  );
  useEffect(() => {
    apiFetch<{ comments: Comment[] }>(`/api/v1/books/${book.id}/comments`)
      .then((r) => setComments(r.comments))
      .catch(() => {});
  }, [book.id, eventTick]);
  useEffect(() => {
    if (tab !== "history") return;
    apiFetch<{ activity: ActivityEntry[] }>(`/api/v1/books/${book.id}/activity?limit=150`)
      .then((r) => setActivity(r.activity))
      .catch(() => {});
  }, [book.id, tab, eventTick]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Alt + ↑/↓ moves between spreads.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      const order = [CHARACTERS, COVER, ...book.spreads.map((s) => s.id)];
      const i = order.indexOf(selected);
      const next = order[Math.min(Math.max(i + (e.key === "ArrowDown" ? 1 : -1), 0), order.length - 1)];
      if (next) setSelected(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book.spreads, selected]);

  const openForAgent = comments.filter((c) => !c.parentId && !c.resolvedAt && c.addressedTo === "agent").length;
  const openForHuman = comments.filter((c) => !c.parentId && !c.resolvedAt && c.addressedTo === "human").length;
  const commentsBySpread = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comments) if (!c.parentId && !c.resolvedAt && c.spreadId) map.set(c.spreadId, (map.get(c.spreadId) ?? 0) + 1);
    return map;
  }, [comments]);

  const liveRecent = live && live.type === "agent" && now - live.at < 60_000 ? live : null;
  const pages = printedPageCount(book.spreads.length);

  async function addSpreadAfter(position: number) {
    try {
      const created = await apiFetch<Spread>(`/api/v1/books/${book.id}/spreads`, { method: "POST", json: { position } });
      await reload();
      setSelected(created.id);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function uploadIllustration(target: Spread, file: File) {
    setUploading(target.id);
    try {
      await uploadFile(`/api/v1/books/${book.id}/spreads/${target.id}/illustration`, file);
      await reload();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setUploading(null);
    }
  }

  async function removeIllustration(target: Spread) {
    try {
      await apiFetch(`/api/v1/books/${book.id}/spreads/${target.id}/illustration`, { method: "DELETE" });
      await reload();
      toast.show("Illustration retirée", { action: { label: "Annuler", onClick: () => void undoLast(target.id) } });
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function uploadCover(file: File) {
    setUploading(COVER);
    try {
      applyBook(await uploadFile<Book>(`/api/v1/books/${book.id}/cover`, file));
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setUploading(null);
    }
  }

  async function removeCover() {
    try {
      applyBook(await apiFetch<Book>(`/api/v1/books/${book.id}/cover`, { method: "DELETE" }));
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  /** Restores the latest history entry of a spread or a character (the "Annuler" of toasts). */
  async function undoLast(spreadId?: string, characterId?: string) {
    try {
      const filter = spreadId ? `&spreadId=${spreadId}` : characterId ? `&characterId=${characterId}` : "";
      const { activity: entries } = await apiFetch<{ activity: ActivityEntry[] }>(`/api/v1/books/${book.id}/activity?limit=1${filter}`);
      const last = entries[0];
      if (!last?.restorable) return;
      applyBook(await apiFetch<Book>(`/api/v1/activity/${last.id}/restore?bookId=${book.id}`, { method: "POST" }));
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function deleteSpread(target: Spread) {
    const i = book.spreads.indexOf(target);
    setSelected(book.spreads[i + 1]?.id ?? book.spreads[i - 1]?.id ?? COVER);
    try {
      await apiFetch(`/api/v1/books/${book.id}/spreads/${target.id}`, { method: "DELETE" });
      await reload();
      toast.show(`Double page ${target.position + 1} supprimée`, { action: { label: "Annuler", onClick: () => void undoLast(target.id) } });
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function reorder(order: string[]) {
    try {
      applyBook(await apiFetch<Book>(`/api/v1/books/${book.id}/spreads`, { method: "PUT", json: { order } }));
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  function move(target: Spread, delta: number) {
    const ids = book.spreads.map((s) => s.id);
    const i = ids.indexOf(target.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    void reorder(ids);
  }

  function onDrop(targetId: string, where: "before" | "after") {
    if (!dragId || dragId === targetId) return;
    const ids = book.spreads.map((s) => s.id).filter((id) => id !== dragId);
    const at = ids.indexOf(targetId) + (where === "after" ? 1 : 0);
    ids.splice(at, 0, dragId);
    void reorder(ids);
  }

  async function changeStatus(status: BookStatus) {
    try {
      await updateBook({ status });
      toast.show(`Statut : ${STATUS_LABELS[status]}`);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const coverFormat = getFormat(book.format);

  return (
    <div className={styles.editor}>
      <header className={styles.bar}>
        <LinkButton href="/" variant="ghost" size="sm" iconOnly tip="Bibliothèque" icon={<ArrowLeft />} />
        <TitleInput book={book} onSave={(title) => updateBook({ title })} />
        <Select<BookStatus>
          className={styles.statusSelect}
          value={book.status}
          onChange={(s) => void changeStatus(s)}
          options={BOOK_STATUSES.map((s) => ({
            value: s,
            label: STATUS_LABELS[s],
            style: { display: "inline-flex", alignItems: "center", gap: 8 },
          }))}
          renderValue={(o) => (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: STATUS_DOT[STATUS_TONES[o.value]] }} />
              {o.label}
            </span>
          )}
        />
        {liveRecent && <span className={styles.live}>{liveRecent.name} travaille</span>}
        <span className={styles.barSpacer} />
        <span className={styles.meta} title={pages.multipleOf4 ? undefined : "Les imprimeurs assemblent des cahiers de 4 pages : ajouter ou retirer une double page."}>
          {book.wordCount} mots · {pages.pages} p.{!pages.multipleOf4 && " ⚠"}
        </span>
        <span className={styles.meta} aria-live="polite">
          <span className={styles.saveDot} data-saving={saving} />
          {saving ? "Enregistrement" : "Enregistré"}
        </span>
        <ShareButton bookId={book.id} title={book.title} />
        <LinkButton href={`/livres/${book.id}/lire`} variant="secondary" size="sm" icon={<BookOpen />}>
          Lire
        </LinkButton>
        <LinkButton href={`/livres/${book.id}/imprimer`} target="_blank" variant="secondary" size="sm" iconOnly tip="Imprimer / PDF" icon={<Printer />} />
      </header>

      <nav className={styles.rail} aria-label="Doubles pages">
        <ol className={styles.thumbList}>
          <li>
            <button type="button" className={styles.thumb} aria-current={selected === CHARACTERS} onClick={() => setSelected(CHARACTERS)}>
              <span className={characterStyles.railIcon}>
                {book.characters.length > 0 ? <AvatarStack characters={book.characters} max={4} size={30} /> : <Users size={22} aria-hidden />}
              </span>
              <span className={styles.thumbMeta}>Personnages · {book.characters.length}</span>
            </button>
          </li>
          <li>
            <button type="button" className={styles.thumb} aria-current={selected === COVER} onClick={() => setSelected(COVER)}>
              <div className={`${styles.thumbSpread} ${styles.coverThumb}`}>
                <div className={`${pageStyles.page} ${pageStyles.single}`} style={pageVars(book.format, book.typography)}>
                  <CoverContent book={book} size="thumb" />
                </div>
              </div>
              <span className={styles.thumbMeta}>Couverture</span>
            </button>
          </li>
          {book.spreads.map((s, i) => {
            const agentHere = live?.type === "agent" && live.spreadId === s.id && now - live.at < 30_000;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.thumb}
                  aria-current={selected === s.id}
                  aria-label={`Double page ${i + 1}`}
                  draggable
                  data-drop={dropTarget?.id === s.id ? dropTarget.where : undefined}
                  onClick={() => setSelected(s.id)}
                  onDragStart={(e) => {
                    setDragId(s.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const vertical = rect.height > rect.width * 0.4;
                    const before = vertical ? e.clientY < rect.top + rect.height / 2 : e.clientX < rect.left + rect.width / 2;
                    setDropTarget({ id: s.id, where: before ? "before" : "after" });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dropTarget) onDrop(dropTarget.id, dropTarget.where);
                    setDropTarget(null);
                  }}
                >
                  {agentHere && (
                    <span className={styles.agentMark} title={`${live?.name} vient de modifier cette page`}>
                      ✦
                    </span>
                  )}
                  <div className={styles.thumbSpread}>
                    <SpreadView book={book} spread={s} size="thumb" showBrief={false} />
                  </div>
                  <span className={styles.thumbMeta}>
                    {i + 1}
                    <AvatarStack characters={book.characters.filter((c) => s.characterIds.includes(c.id))} size={16} />
                    <span className={styles.flag}>
                      {(commentsBySpread.get(s.id) ?? 0) > 0 && (
                        <span className={styles.flagDot} style={{ background: "var(--color-agent)" }} title="Échange ouvert" />
                      )}
                      <span
                        className={styles.flagDot}
                        style={{ background: s.text.trim() ? "var(--color-success)" : "var(--color-border-strong)" }}
                        title={s.text.trim() ? "Texte écrit" : "Texte à écrire"}
                      />
                      <span
                        className={styles.flagDot}
                        style={{ background: s.illustration ? "var(--color-success)" : "var(--color-border-strong)" }}
                        title={s.illustration ? "Illustration posée" : "Illustration à faire"}
                      />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Button variant="secondary" size="sm" icon={<Plus />} className={styles.addSpread} onClick={() => void addSpreadAfter(book.spreads.length)}>
          Double page
        </Button>
      </nav>

      <section className={styles.bench} aria-label="Plan de travail" data-mode={selected === CHARACTERS ? "characters" : undefined}>
        {selected === CHARACTERS ? (
          <CharacterBoard book={book} selectedId={character?.id ?? null} onSelect={(id) => {
            setCharacter(id);
            setTab("page");
          }} onChanged={reload} />
        ) : selected === COVER || !spread ? (
          <CoverCanvas book={book} uploading={uploading === COVER} onUpload={(f) => void uploadCover(f)} onRemove={() => void removeCover()} />
        ) : (
          <SpreadCanvas
            book={book}
            spread={spread}
            uploading={uploading === spread.id}
            onText={(text) => editSpread(spread.id, { text })}
            onUpload={(f) => void uploadIllustration(spread, f)}
            onRemoveIllustration={() => void removeIllustration(spread)}
          />
        )}
        <div className={styles.benchFoot}>
          <div className={styles.pager}>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              tip="Précédente (Alt ↑)"
              tipUp
              icon={<ChevronLeft />}
              disabled={selected === CHARACTERS}
              onClick={() => setSelected(selected === COVER ? CHARACTERS : index <= 0 ? COVER : (book.spreads[index - 1]?.id ?? COVER))}
            />
            <span>
              {selected === CHARACTERS
                ? `Personnages · ${book.characters.length}`
                : selected === COVER || !spread
                  ? `Couverture · ${coverFormat.label}`
                  : `Double page ${index + 1}/${book.spreads.length} · p. ${index * 2 + 2}–${index * 2 + 3}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              tip="Suivante (Alt ↓)"
              tipUp
              icon={<ChevronRight />}
              disabled={selected !== CHARACTERS && index >= book.spreads.length - 1}
              onClick={() => setSelected(selected === CHARACTERS ? COVER : (book.spreads[index + 1]?.id ?? selected))}
            />
          </div>
        </div>
      </section>

      <aside className={styles.panel} aria-label="Réglages">
        <div className={styles.tabs} role="tablist">
          {(
            [
              { key: "page", label: selected === CHARACTERS ? "Personnage" : selected === COVER ? "Couverture" : "Page" },
              { key: "book", label: "Livre" },
              { key: "comments", label: "Échanges", count: openForHuman },
              { key: "history", label: "Historique" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={styles.tab}
              onClick={() => setTab(t.key)}
              title={t.label}
            >
              {t.label}
              {"count" in t && t.count > 0 && (
                <span className={styles.tabCount} title="En attente de votre réponse">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.panelBody} role="tabpanel">
          {tab === "page" &&
            (selected === CHARACTERS ? (
              <CharacterPanel
                book={book}
                character={character}
                onChanged={reload}
                onUndo={(id) => void undoLast(undefined, id)}
                onSelectSpread={(id) => setSelected(id)}
              />
            ) : spread && selected !== COVER ? (
              <PagePanel
                book={book}
                spread={spread}
                index={index}
                onEdit={(patch) => editSpread(spread.id, patch)}
                onUpload={(f) => void uploadIllustration(spread, f)}
                onRemoveIllustration={() => void removeIllustration(spread)}
                onDelete={() => void deleteSpread(spread)}
                onMove={(d) => move(spread, d)}
                onInsertAfter={() => void addSpreadAfter(index + 1)}
                onAsk={() => setTab("comments")}
                onOpenCharacters={() => setSelected(CHARACTERS)}
              />
            ) : (
              <BookPanel book={book} customFonts={customFonts} onUpdate={updateBook} only="cover" onUploadCover={(f) => void uploadCover(f)} onRemoveCover={() => void removeCover()} />
            ))}
          {tab === "book" && <BookPanel book={book} customFonts={customFonts} onUpdate={updateBook} onUploadCover={(f) => void uploadCover(f)} onRemoveCover={() => void removeCover()} />}
          {tab === "comments" && (
            <CommentsPanel
              book={book}
              comments={comments}
              currentSpread={spread && selected !== COVER && selected !== CHARACTERS ? spread : null}
              openForAgent={openForAgent}
              onChanged={loadComments}
              onSelectSpread={(id) => setSelected(id)}
            />
          )}
          {tab === "history" && (
            <HistoryPanel
              book={book}
              activity={activity}
              onRestored={(next) => {
                applyBook(next);
                void loadActivity();
              }}
              onSelectSpread={(id) => setSelected(id)}
              onSelectCharacter={(id) => {
                setCharacter(id);
                setSelected(CHARACTERS);
              }}
            />
          )}
        </div>
      </aside>

      <Dialog
        open={!!conflict}
        onClose={() => resolveConflict("theirs")}
        title="Page modifiée pendant votre saisie"
        footer={
          <>
            <Button variant="secondary" onClick={() => resolveConflict("theirs")}>
              Prendre sa version
            </Button>
            <Button onClick={() => resolveConflict("mine")}>Garder la mienne</Button>
          </>
        }
      >
        <p>
          {conflict?.theirs.updatedBy.name} a modifié la double page {(conflict?.theirs.position ?? 0) + 1} pendant que vous écriviez. La version écartée
          reste dans l&apos;historique.
        </p>
        {conflict?.theirs.text !== undefined && conflict.mine.text !== undefined && (
          <div className={styles.row}>
            <div className={styles.section}>
              <span className={styles.sectionTitle}>La sienne</span>
              <p className={styles.msgBody}>{conflict.theirs.text || "—"}</p>
            </div>
            <div className={styles.section}>
              <span className={styles.sectionTitle}>La vôtre</span>
              <p className={styles.msgBody}>{conflict.mine.text || "—"}</p>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function TitleInput({ book, onSave }: { book: Book; onSave: (title: string) => Promise<unknown> }) {
  const [value, setValue] = useState(book.title);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(book.title);
  // A title changed elsewhere (the agent) shows up unless the field is being edited.
  if (book.title !== seen && !focused) {
    setSeen(book.title);
    setValue(book.title);
  }
  return (
    <input
      className={styles.titleInput}
      value={value}
      aria-label="Titre du livre"
      maxLength={160}
      onFocus={() => setFocused(true)}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onBlur={() => {
        setFocused(false);
        const title = value.trim();
        if (title && title !== book.title) void onSave(title);
        else setValue(book.title);
      }}
    />
  );
}
