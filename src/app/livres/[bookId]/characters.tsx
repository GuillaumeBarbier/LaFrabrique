/* eslint-disable @next/next/no-img-element -- private, authenticated assets: no image optimiser. */
"use client";

import { ImagePlus, Plus, Star, Trash2, Users } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Dropzone, EmptyState } from "@/components/ui/controls";
import { Hint, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, uploadFile } from "@/lib/client";
import type { Book, Character } from "@/lib/types";
import styles from "./characters.module.css";
import { BoundTextArea, BoundTextField } from "./panels/fields";
import { useFileDrop } from "./spread-canvas";

// Characters (F2.1): a board on the workbench, a sheet in the side panel, and the "who is on
// this page" chips of each spread. References guide the illustrating agent (ADR-0006).

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff";

/** Stable soft colour from a name, for characters without an image yet. */
function tint(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 82%)`;
}

export function primaryImage(c: Character) {
  return c.images.find((i) => i.primary) ?? c.images[0] ?? null;
}

export function CharacterAvatar({ character, size = 28 }: { character: Character; size?: number }) {
  const img = primaryImage(character);
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: size * 0.42, background: img ? undefined : tint(character.name) } as CSSProperties}
      title={character.name}
      aria-hidden
    >
      {img ? <img src={img.image.thumbUrl} alt="" /> : character.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ characters, max = 3, size = 22 }: { characters: Character[]; max?: number; size?: number }) {
  if (characters.length === 0) return null;
  return (
    <span className={styles.stack}>
      {characters.slice(0, max).map((c) => (
        <CharacterAvatar key={c.id} character={c} size={size} />
      ))}
      {characters.length > max && <span className={styles.more}>+{characters.length - max}</span>}
    </span>
  );
}

function pagesOf(book: Book, characterId: string): number[] {
  return book.spreads.flatMap((s, i) => (s.characterIds.includes(characterId) ? [i + 1] : []));
}

// ---------------------------------------------------------------------------------------
// Board (workbench)
// ---------------------------------------------------------------------------------------

function CharacterCard({
  book,
  character,
  selected,
  onSelect,
  onImage,
}: {
  book: Book;
  character: Character;
  selected: boolean;
  onSelect: () => void;
  onImage: (file: File) => void;
}) {
  const drop = useFileDrop(onImage);
  const img = primaryImage(character);
  const pages = pagesOf(book, character.id);
  return (
    <li>
      <button type="button" className={styles.card} aria-current={selected} onClick={onSelect} data-over={drop.over} {...drop.handlers}>
        <span className={styles.portrait} style={img ? undefined : { background: tint(character.name) }}>
          {img ? <img src={img.image.webUrl} alt="" draggable={false} /> : <span className={styles.initial}>{character.name.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className={styles.cardName}>{character.name}</span>
        {character.role && <span className={styles.cardRole}>{character.role}</span>}
        <span className={styles.cardMeta}>
          {character.images.length} image{character.images.length > 1 ? "s" : ""}
          {pages.length > 0 && ` · p. ${pages.join(", ")}`}
        </span>
      </button>
    </li>
  );
}

export function CharacterBoard({
  book,
  selectedId,
  onSelect,
  onChanged,
}: {
  book: Book;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const c = await apiFetch<Character>(`/api/v1/books/${book.id}/characters`, { method: "POST", json: { name: name.trim() } });
      setName("");
      setCreating(false);
      await onChanged();
      onSelect(c.id);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  async function addImage(character: Character, file: File) {
    try {
      await uploadFile(`/api/v1/books/${book.id}/characters/${character.id}/images`, file, {}, "POST");
      await onChanged();
      onSelect(character.id);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const form = (
    <form className={styles.newForm} onSubmit={create}>
      <TextField aria-label="Nom du personnage" placeholder="Nom du personnage" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="sm" disabled={!name.trim()}>
        Créer
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
        Annuler
      </Button>
    </form>
  );

  return (
    <div className={styles.board}>
      <header className={styles.boardHead}>
        <h2 className={styles.boardTitle}>Personnages</h2>
        <Hint text="Leurs images de référence guident l'agent qui illustre : il les récupère pour chaque double page où ils apparaissent." />
        <span className={styles.spacer} />
        {!creating && book.characters.length > 0 && (
          <Button size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
            Nouveau personnage
          </Button>
        )}
      </header>
      {creating && form}
      {book.characters.length === 0 ? (
        creating ? null : (
          <EmptyState
            title="Aucun personnage"
            text="Une fiche par personnage : son nom, son apparence et ses images de référence, pour qu'il ait le même visage à chaque page."
            action={
              <Button icon={<Plus />} onClick={() => setCreating(true)}>
                Nouveau personnage
              </Button>
            }
          />
        )
      ) : (
        <ul className={styles.grid} role="list">
          {book.characters.map((c) => (
            <CharacterCard
              key={c.id}
              book={book}
              character={c}
              selected={c.id === selectedId}
              onSelect={() => onSelect(c.id)}
              onImage={(f) => void addImage(c, f)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Sheet (side panel)
// ---------------------------------------------------------------------------------------

export function CharacterPanel({
  book,
  character,
  onChanged,
  onUndo,
  onSelectSpread,
}: {
  book: Book;
  character: Character | null;
  onChanged: () => Promise<void>;
  onUndo: (characterId: string) => void;
  onSelectSpread: (spreadId: string) => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  if (!character) return <EmptyState title="Choisir un personnage" text="Ou en créer un sur le plan de travail." />;
  const base = `/api/v1/books/${book.id}/characters/${character.id}`;

  async function call(fn: () => Promise<unknown>, done?: string, undo = false) {
    try {
      await fn();
      await onChanged();
      if (done) toast.show(done, undo && character ? { action: { label: "Annuler", onClick: () => onUndo(character.id) } } : undefined);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const save = (patch: Record<string, string>) => void call(() => apiFetch(base, { method: "PATCH", json: patch }));

  async function upload(file: File) {
    setUploading(true);
    await call(() => uploadFile(`${base}/images`, file, {}, "POST"));
    setUploading(false);
  }

  const spreads = book.spreads.filter((s) => s.characterIds.includes(character.id));

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Fiche</h3>
        <BoundTextField label="Nom" value={character.name} maxLength={80} onSave={(name) => name.trim() && save({ name })} />
        <BoundTextField
          label="Rôle"
          hint="Qui il est dans l'histoire."
          placeholder="Le héros, un renardeau de 6 ans"
          value={character.role}
          onSave={(role) => save({ role })}
        />
        <BoundTextArea
          label="Apparence"
          hint="En mots, pour l'agent qui illustre : couleurs, taille, vêtements, signes distinctifs. Utile même avec des images."
          placeholder="Pelage roux, ventre et bout de queue blancs, écharpe verte à pois jaunes, grands yeux noisette."
          rows={4}
          value={character.appearance}
          onSave={(appearance) => save({ appearance })}
        />
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <div className={styles.titleRow}>
          <h3 className={styles.sectionTitle}>Images de référence</h3>
          <Hint text="Planche, face, profil, expressions… L'étoile désigne l'image à utiliser en premier." />
        </div>
        {character.images.length > 0 && (
          <ul className={styles.refGrid} role="list">
            {character.images.map((img) => (
              <li key={img.id} className={styles.ref}>
                <a href={img.image.url} target="_blank" rel="noreferrer" className={styles.refImage} title="Ouvrir l'original">
                  <img src={img.image.thumbUrl} alt={img.label || character.name} />
                </a>
                <BoundTextField
                  aria-label="Ce que montre l'image"
                  placeholder="face, profil…"
                  maxLength={80}
                  value={img.label}
                  onSave={(label) => void call(() => apiFetch(`${base}/images/${img.id}`, { method: "PATCH", json: { label } }))}
                />
                <div className={styles.refActions}>
                  {img.primary ? (
                    <Badge tone="gold">Principale</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      tip="Image principale"
                      tipUp
                      icon={<Star />}
                      onClick={() => void call(() => apiFetch(`${base}/images/${img.id}`, { method: "PATCH", json: { primary: true } }))}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    tip="Retirer"
                    tipUp
                    icon={<Trash2 />}
                    onClick={() => void call(() => apiFetch(`${base}/images/${img.id}`, { method: "DELETE" }), "Image retirée", true)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Dropzone accept={IMAGE_TYPES} onFile={(f) => void upload(f)} label="Ajouter une image de référence">
          <ImagePlus size={20} aria-hidden />
          <span>{uploading ? "Envoi…" : "Déposer une image de référence"}</span>
        </Dropzone>
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <div className={styles.titleRow}>
          <h3 className={styles.sectionTitle}>Présent sur</h3>
          <Hint text="À cocher dans l'onglet Page de chaque double page, ou par l'agent." />
        </div>
        {spreads.length === 0 ? (
          <p className={styles.muted}>Aucune double page.</p>
        ) : (
          <div className={styles.chips}>
            {spreads.map((s) => (
              <button key={s.id} type="button" className={styles.chip} onClick={() => onSelectSpread(s.id)}>
                Double page {book.spreads.indexOf(s) + 1}
              </button>
            ))}
          </div>
        )}
      </section>

      <hr className={styles.hr} />

      <div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 />}
          onClick={() => void call(() => apiFetch(base, { method: "DELETE" }), `« ${character.name} » supprimé`, true)}
        >
          Supprimer le personnage
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------
// "Who is on this page" (spread panel)
// ---------------------------------------------------------------------------------------

export function SpreadCharacters({
  book,
  characterIds,
  onChange,
  onOpenCharacters,
}: {
  book: Book;
  characterIds: string[];
  onChange: (ids: string[]) => void;
  onOpenCharacters: () => void;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <h3 className={styles.sectionTitle}>Personnages présents</h3>
        <Hint text="L'agent qui illustre récupère leurs images de référence pour cette double page." />
      </div>
      {book.characters.length === 0 ? (
        <Button variant="secondary" size="sm" icon={<Users />} onClick={onOpenCharacters}>
          Créer les personnages
        </Button>
      ) : (
        <div className={styles.chips}>
          {book.characters.map((c) => {
            const on = characterIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={styles.chip}
                aria-pressed={on}
                onClick={() => onChange(on ? characterIds.filter((x) => x !== c.id) : [...characterIds, c.id])}
              >
                <CharacterAvatar character={c} size={22} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
