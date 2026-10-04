"use client";

import { Share2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, CopyBlock, Dialog, Segmented } from "@/components/ui/controls";
import { TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import type { Share } from "@/lib/types";
import styles from "./share.module.css";

// Reading links (ADR-0009): the book in a viewer, for someone without an account.

type Validity = "7" | "30" | "none";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function meta(s: Share): string {
  const parts = [`créé ${relativeTime(s.createdAt)}`];
  if (s.expiresAt) parts.push(`${s.expired ? "expiré le" : "jusqu'au"} ${DATE.format(new Date(s.expiresAt))}`);
  parts.push(s.viewCount === 0 ? "pas encore ouvert" : `${s.viewCount} lecture${s.viewCount > 1 ? "s" : ""}, la dernière ${relativeTime(s.lastViewedAt as string)}`);
  return parts.join(" · ");
}

export function ShareButton({ bookId, title }: { bookId: string; title: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [label, setLabel] = useState("");
  const [validity, setValidity] = useState<Validity>("30");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<Share | null>(null);

  const load = useCallback(async () => {
    try {
      setShares((await apiFetch<{ shares: Share[] }>(`/api/v1/books/${bookId}/shares`)).shares);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }, [bookId, toast]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const share = await apiFetch<Share>(`/api/v1/books/${bookId}/shares`, {
        method: "POST",
        json: { label: label.trim() || undefined, expiresInDays: validity === "none" ? null : Number(validity) },
      });
      setFresh(share.id);
      setLabel("");
      await load();
      if (share.url) await navigator.clipboard?.writeText(share.url).catch(() => undefined);
      toast.show("Lien créé et copié");
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: Share) {
    setToRevoke(null);
    try {
      await apiFetch(`/api/v1/shares/${share.id}`, { method: "DELETE" });
      await load();
      toast.show("Lien révoqué");
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Share2 />}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        Partager
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Faire lire « ${title} »`} wide>
        <form className={styles.form} onSubmit={create}>
          <TextField
            label="Pour qui"
            hint="Pour reconnaître le lien plus tard. Le lecteur n'a pas besoin de compte : il voit la couverture et les pages, rien de l'atelier."
            placeholder="Mamie, la classe de CP…"
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className={styles.row}>
            <Segmented<Validity>
              label="Validité"
              small
              value={validity}
              onChange={setValidity}
              segments={[
                { value: "7", label: "7 jours" },
                { value: "30", label: "30 jours" },
                { value: "none", label: "Sans limite" },
              ]}
            />
            <Button type="submit" loading={busy}>
              Créer le lien
            </Button>
          </div>
        </form>

        {shares && shares.length > 0 && (
          <ul className={styles.list} role="list">
            {shares.map((s) => (
              <li key={s.id} className={styles.item} data-fresh={s.id === fresh || undefined}>
                <div className={styles.head}>
                  <span className={styles.label}>{s.label || "Lien de lecture"}</span>
                  {s.expired && <Badge tone="warning">Expiré</Badge>}
                  <span className={styles.spacer} />
                  <Button variant="ghost" size="sm" iconOnly tip="Révoquer" icon={<Trash2 />} onClick={() => setToRevoke(s)} />
                </div>
                {s.url && !s.expired && <CopyBlock value={s.url} label="Copier le lien" />}
                <p className={styles.meta}>{meta(s)}</p>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        title="Révoquer ce lien ?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToRevoke(null)}>
              Garder
            </Button>
            <Button variant="danger" onClick={() => toRevoke && void revoke(toRevoke)}>
              Révoquer
            </Button>
          </>
        }
      >
        <p>{toRevoke?.label ? `« ${toRevoke.label} »` : "Ce lien"} ne pourra plus ouvrir le livre, tout de suite.</p>
      </Dialog>
    </>
  );
}
