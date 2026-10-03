"use client";

import { Check, Pencil, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dropzone, EmptyState } from "@/components/ui/controls";
import { Hint, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, uploadFile } from "@/lib/client";
import { FONT_CATALOG, FONT_CATEGORY_LABELS, FONT_SAMPLE, type FontCategory, fontFamilyCss } from "@/lib/fonts";
import type { CustomFont } from "@/lib/types";
import styles from "../settings.module.css";

const CATEGORIES = Object.keys(FONT_CATEGORY_LABELS) as FontCategory[];

export function Typographies({ custom }: { custom: CustomFont[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sample, setSample] = useState(FONT_SAMPLE);

  async function upload(file: File) {
    setBusy(true);
    try {
      await uploadFile("/api/v1/fonts", file, {}, "POST");
      // The stylesheet of uploaded fonts is cached by React: reload it.
      window.location.reload();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
      setBusy(false);
    }
  }

  async function rename(font: CustomFont) {
    try {
      await apiFetch(`/api/v1/fonts/${font.id}`, { method: "PATCH", json: { name: draft } });
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function remove(font: CustomFont) {
    try {
      await apiFetch(`/api/v1/fonts/${font.id}`, { method: "DELETE" });
      router.refresh();
      toast.show(`« ${font.name} » supprimée`);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Mes polices</h2>
          <Hint text="TTF, OTF, WOFF ou WOFF2, 10 Mo au plus. Vérifier que la licence autorise l'impression d'un livre." />
        </div>
        <Dropzone accept=".ttf,.otf,.woff,.woff2,font/*" onFile={(f) => void upload(f)} label="Téléverser une police">
          <Upload size={20} aria-hidden />
          <span>{busy ? "Envoi…" : "Déposer un fichier de police"}</span>
        </Dropzone>
        {custom.length === 0 ? (
          <p className={styles.muted}>Aucune police personnelle.</p>
        ) : (
          <ul className={styles.list}>
            {custom.map((f) => (
              <li key={f.id} className={styles.item}>
                <div className={styles.itemMain}>
                  {editing === f.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void rename(f);
                      }}
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <TextField aria-label="Nom de la police" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} />
                      <Button type="submit" size="sm" iconOnly tip="Enregistrer" icon={<Check />} />
                      <Button variant="ghost" size="sm" iconOnly tip="Annuler" icon={<X />} onClick={() => setEditing(null)} />
                    </form>
                  ) : (
                    <span className={styles.itemName}>{f.name}</span>
                  )}
                  <span className={styles.fontSample} style={{ fontFamily: fontFamilyCss(f.key) }}>
                    {sample}
                  </span>
                  <span className={styles.mono}>{f.format}</span>
                </div>
                {editing !== f.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    tip="Renommer"
                    icon={<Pencil />}
                    onClick={() => {
                      setDraft(f.name);
                      setEditing(f.id);
                    }}
                  />
                )}
                <Button variant="ghost" size="sm" iconOnly tip="Supprimer" icon={<Trash2 />} onClick={() => void remove(f)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Polices installées</h2>
          <Hint text="Google Fonts hébergées par La Fabrique : rien n'est chargé depuis Google, tout s'imprime." />
        </div>
        <TextField aria-label="Phrase d'essai" value={sample} onChange={(e) => setSample(e.target.value || FONT_SAMPLE)} />
        {CATEGORIES.map((cat) => {
          const fonts = FONT_CATALOG.filter((f) => f.category === cat);
          if (fonts.length === 0) return null;
          return (
            <div key={cat} className={styles.steps}>
              <h3 className={styles.groupTitle}>{FONT_CATEGORY_LABELS[cat]}</h3>
              <div className={styles.fontGrid}>
                {fonts.map((f) => (
                  <div key={f.key} className={styles.fontCard} title={f.note}>
                    <span className={styles.mono}>{f.family}</span>
                    <span className={styles.fontSample} style={{ fontFamily: fontFamilyCss(f.key) }}>
                      {sample}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {FONT_CATALOG.length === 0 && <EmptyState title="Catalogue vide" />}
      </section>
    </>
  );
}
