"use client";

import { Bot, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/controls";
import { Hint } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import type { Comment } from "@/lib/types";
import page from "../page.module.css";
import styles from "../parametres/settings.module.css";

type Request = Comment & { bookTitle: string; replies: Comment[] };

export function Inbox({ forHuman, forAgent }: { forHuman: Request[]; forAgent: Request[] }) {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  async function resolve(r: Request) {
    try {
      await apiFetch(`/api/v1/comments/${r.id}`, { method: "PATCH", json: { resolved: true } });
      router.refresh();
      toast.show("Marqué comme résolu", {
        action: {
          label: "Annuler",
          onClick: () => void apiFetch(`/api/v1/comments/${r.id}`, { method: "PATCH", json: { resolved: false } }).then(() => router.refresh()),
        },
      });
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const list = (items: Request[], empty: string) =>
    items.length === 0 ? (
      <EmptyState title={empty} />
    ) : (
      <ul className={styles.list}>
        {items.map((r) => {
          const last = r.replies.at(-1);
          return (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.mono}>
                  <Link href={`/livres/${r.bookId}`}>{r.bookTitle}</Link> · {r.author.name} · {relativeTime(r.createdAt)}
                </span>
                <span style={{ whiteSpace: "pre-wrap" }}>{r.body}</span>
                {last && (
                  <span className={styles.muted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {last.author.type === "agent" && <Bot size={14} aria-hidden />}
                    {last.author.name} : {last.body.length > 160 ? `${last.body.slice(0, 160)}…` : last.body}
                  </span>
                )}
              </div>
              {r.replies.length > 0 && <Badge>{r.replies.length} réponse{r.replies.length > 1 ? "s" : ""}</Badge>}
              <Button variant="ghost" size="sm" icon={<Check />} onClick={() => void resolve(r)}>
                Résolu
              </Button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1 className={page.title}>Échanges</h1>
      </header>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Pour vous</h2>
          <Hint text="Questions et propositions des agents, en attente de votre réponse." />
        </div>
        {list(forHuman, "Rien en attente")}
      </section>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Pour l&apos;agent</h2>
          <Hint text="Vos demandes que l'agent n'a pas encore marquées résolues. Il les lit à chaque connexion." />
        </div>
        {list(forAgent, "Aucune demande en cours")}
      </section>
    </div>
  );
}
