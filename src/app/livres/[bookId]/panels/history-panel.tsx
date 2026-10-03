"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Segmented } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import type { ActivityEntry, Book } from "@/lib/types";
import styles from "../editor.module.css";

type Who = "all" | "agent" | "human";

export function HistoryPanel({
  book,
  activity,
  onRestored,
  onSelectSpread,
}: {
  book: Book;
  activity: ActivityEntry[];
  onRestored: (book: Book) => void;
  onSelectSpread: (id: string) => void;
}) {
  const toast = useToast();
  const [who, setWho] = useState<Who>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = activity.filter((a) => who === "all" || a.actor.type === who);

  async function restore(entry: ActivityEntry) {
    setBusy(entry.id);
    try {
      onRestored(await apiFetch<Book>(`/api/v1/activity/${entry.id}/restore`, { method: "POST" }));
      toast.show("Version restaurée");
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  const where = (a: ActivityEntry) => {
    if (!a.spreadId) return "Livre";
    const i = book.spreads.findIndex((s) => s.id === a.spreadId);
    return i >= 0 ? `Double page ${i + 1}` : "Page supprimée";
  };

  return (
    <>
      <Segmented<Who>
        label="Auteur"
        small
        value={who}
        onChange={setWho}
        segments={[
          { value: "all", label: "Tout" },
          { value: "agent", label: "Agents" },
          { value: "human", label: "Moi" },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title="Rien pour l'instant" />
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((a) => (
            <li key={a.id} className={styles.histItem}>
              <span className={styles.histDot} data-agent={a.actor.type === "agent"} aria-hidden />
              <div className={styles.histText}>
                <span className={styles.histSummary}>
                  <strong>{a.actor.name}</strong> · {a.summary}
                </span>
                <span className={styles.msgTime}>
                  {a.spreadId && book.spreads.some((s) => s.id === a.spreadId) ? (
                    <button type="button" className={styles.linkish} onClick={() => onSelectSpread(a.spreadId as string)}>
                      {where(a)}
                    </button>
                  ) : (
                    where(a)
                  )}{" "}
                  · {relativeTime(a.updatedAt)}
                </span>
              </div>
              {a.restorable && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  tip="Revenir à l'état d'avant"
                  icon={<RotateCcw />}
                  loading={busy === a.id}
                  onClick={() => void restore(a)}
                />
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
