"use client";

import { Bot, Check, RotateCcw, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Switch } from "@/components/ui/controls";
import { TextArea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import type { Book, Comment, Spread } from "@/lib/types";
import styles from "../editor.module.css";

type Scope = "page" | "open" | "all";

export function CommentsPanel({
  book,
  comments,
  currentSpread,
  openForAgent,
  onChanged,
  onSelectSpread,
}: {
  book: Book;
  comments: Comment[];
  currentSpread: Spread | null;
  openForAgent: number;
  onChanged: () => Promise<void>;
  onSelectSpread: (id: string) => void;
}) {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>(currentSpread ? "page" : "open");
  const [body, setBody] = useState("");
  const [forAgent, setForAgent] = useState(true);
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId);
    const filtered = roots.filter((c) =>
      scope === "page" ? c.spreadId === currentSpread?.id : scope === "open" ? !c.resolvedAt : true,
    );
    return filtered
      .map((root) => ({ root, replies: comments.filter((c) => c.parentId === root.id) }))
      .sort((a, b) => Number(!!a.root.resolvedAt) - Number(!!b.root.resolvedAt) || b.root.createdAt.localeCompare(a.root.createdAt));
  }, [comments, scope, currentSpread?.id]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/books/${book.id}/comments`, {
        method: "POST",
        json: {
          body: body.trim(),
          spreadId: attach && currentSpread ? currentSpread.id : null,
          addressedTo: forAgent ? "agent" : null,
        },
      });
      setBody("");
      await onChanged();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const spreadNumber = (id: string | null) => {
    const i = book.spreads.findIndex((s) => s.id === id);
    return i >= 0 ? i + 1 : null;
  };

  return (
    <>
      <form className={styles.composer} onSubmit={post}>
        <TextArea
          aria-label="Message"
          rows={3}
          placeholder={forAgent ? "Demande à l'agent : « rends ce passage plus drôle »…" : "Note pour plus tard…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post(e);
          }}
        />
        <Switch label="À traiter par l'agent" hint="L'agent voit la demande dans sa liste et la marque résolue une fois faite." checked={forAgent} onChange={setForAgent} />
        {currentSpread && (
          <Switch label={`Sur la double page ${currentSpread.position + 1}`} checked={attach} onChange={setAttach} />
        )}
        <Button type="submit" size="sm" icon={<Send />} loading={busy} disabled={!body.trim()}>
          Envoyer
        </Button>
        {openForAgent > 0 && (
          <p className={styles.words}>
            {openForAgent} demande{openForAgent > 1 ? "s" : ""} en attente de l&apos;agent
          </p>
        )}
      </form>

      <Segmented<Scope>
        label="Afficher"
        small
        value={scope}
        onChange={setScope}
        segments={[
          ...(currentSpread ? [{ value: "page" as const, label: "Cette page" }] : []),
          { value: "open", label: "Ouverts" },
          { value: "all", label: "Tout" },
        ]}
      />

      {threads.length === 0 ? (
        <EmptyState title="Aucun échange" />
      ) : (
        threads.map(({ root, replies }) => (
          <Thread
            key={root.id}
            root={root}
            replies={replies}
            bookId={book.id}
            spreadNumber={spreadNumber(root.spreadId)}
            onChanged={onChanged}
            onSelectSpread={() => root.spreadId && onSelectSpread(root.spreadId)}
          />
        ))
      )}
    </>
  );
}

function Message({ c }: { c: Comment }) {
  return (
    <div className={styles.msg}>
      <div className={styles.msgHead}>
        {c.author.type === "agent" && <Bot size={14} color="var(--color-agent)" aria-label="Agent" />}
        <span className={styles.msgAuthor}>{c.author.name}</span>
        <span className={styles.msgTime}>{relativeTime(c.createdAt)}</span>
      </div>
      <p className={styles.msgBody}>{c.body}</p>
    </div>
  );
}

function Thread({
  root,
  replies,
  bookId,
  spreadNumber,
  onChanged,
  onSelectSpread,
}: {
  root: Comment;
  replies: Comment[];
  bookId: string;
  spreadNumber: number | null;
  onChanged: () => Promise<void>;
  onSelectSpread: () => void;
}) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");

  async function resolve(value: boolean) {
    try {
      await apiFetch(`/api/v1/comments/${root.id}`, { method: "PATCH", json: { resolved: value } });
      await onChanged();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await apiFetch(`/api/v1/books/${bookId}/comments`, { method: "POST", json: { body: text.trim(), parentId: root.id } });
      setText("");
      setReplying(false);
      await onChanged();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  return (
    <article className={styles.thread} data-resolved={!!root.resolvedAt}>
      <div className={styles.inline}>
        {root.addressedTo === "agent" && <Badge tone="agent">Pour l&apos;agent</Badge>}
        {root.addressedTo === "human" && <Badge tone="gold">Pour vous</Badge>}
        {root.resolvedAt && <Badge tone="success">Résolu</Badge>}
        {spreadNumber && (
          <button type="button" className={styles.linkish} onClick={onSelectSpread}>
            Double page {spreadNumber}
          </button>
        )}
      </div>
      <Message c={root} />
      {replies.map((r) => (
        <Message key={r.id} c={r} />
      ))}
      {replying ? (
        <form className={styles.composer} onSubmit={reply}>
          <TextArea aria-label="Réponse" rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
          <div className={styles.threadActions}>
            <Button type="submit" size="sm" disabled={!text.trim()}>
              Répondre
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReplying(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.threadActions}>
          <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
            Répondre
          </Button>
          {root.resolvedAt ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={() => void resolve(false)}>
              Rouvrir
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={<Check />} onClick={() => void resolve(true)}>
              Résolu
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
