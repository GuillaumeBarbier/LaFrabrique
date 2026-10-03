"use client";

import { KeyRound, Plus, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, CopyBlock, Dialog, EmptyState, Segmented } from "@/components/ui/controls";
import { Hint, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, relativeTime } from "@/lib/client";
import styles from "../settings.module.css";

interface KeyInfo {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

type Client = "claude-code" | "claude-desktop" | "rest";

function snippets(origin: string, key: string): Record<Client, string> {
  return {
    "claude-code": `claude mcp add --transport http lafabrique ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${key}"`,
    "claude-desktop": JSON.stringify(
      {
        mcpServers: {
          lafabrique: {
            command: "npx",
            args: ["-y", "mcp-remote", `${origin}/api/mcp`, "--header", "Authorization:${LAFABRIQUE_AUTH}"],
            env: { LAFABRIQUE_AUTH: `Bearer ${key}` },
          },
        },
      },
      null,
      2,
    ),
    rest: `curl -H "Authorization: Bearer ${key}" ${origin}/api/v1/requests\n\n# Index de l'API et consignes de travail :\ncurl -H "Authorization: Bearer ${key}" ${origin}/api/v1`,
  };
}

export function AgentKeys({ keys, origin, guide }: { keys: KeyInfo[]; origin: string; guide: string }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Claude");
  const [scope, setScope] = useState<"write" | "read">("write");
  const [created, setCreated] = useState<{ key: string; info: KeyInfo } | null>(null);
  const [client, setClient] = useState<Client>("claude-code");
  const [toRevoke, setToRevoke] = useState<KeyInfo | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<{ key: string; info: KeyInfo }>("/api/v1/keys", { method: "POST", json: { name: name.trim(), scope } });
      setCreating(false);
      setCreated(res);
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: KeyInfo) {
    try {
      await apiFetch(`/api/v1/keys/${k.id}`, { method: "DELETE" });
      setToRevoke(null);
      router.refresh();
      toast.show(`Clé « ${k.name} » révoquée`);
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    }
  }

  const active = keys.filter((k) => !k.revokedAt);
  const sample = snippets(origin, created?.key ?? "lfab_…");

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Clés API</h2>
          <Hint text="Une clé par agent : son nom signe chacune de ses modifications. Lecture seule pour un agent qui relit sans écrire." />
          <Button icon={<Plus />} onClick={() => setCreating(true)}>
            Créer une clé
          </Button>
        </div>
        {keys.length === 0 ? (
          <EmptyState title="Aucun agent connecté" text="Une clé permet à Claude (ou à tout agent) de lire et d'écrire vos livres." />
        ) : (
          <ul className={styles.list}>
            {keys.map((k) => (
              <li key={k.id} className={[styles.item, k.revokedAt && styles.revoked].filter(Boolean).join(" ")}>
                <KeyRound size={18} aria-hidden />
                <div className={styles.itemMain}>
                  <span className={styles.itemName}>{k.name}</span>
                  <span className={styles.mono}>
                    {k.prefix}… · créée {relativeTime(k.createdAt)} ·{" "}
                    {k.revokedAt ? `révoquée ${relativeTime(k.revokedAt)}` : k.lastUsedAt ? `utilisée ${relativeTime(k.lastUsedAt)}` : "jamais utilisée"}
                  </span>
                </div>
                <Badge tone={k.scope === "write" ? "agent" : "neutral"}>{k.scope === "write" ? "Écriture" : "Lecture"}</Badge>
                {!k.revokedAt && (
                  <Button variant="danger" size="sm" icon={<ShieldOff />} onClick={() => setToRevoke(k)}>
                    Révoquer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Brancher un agent</h2>
          <Hint text="Serveur MCP pour Claude ; API REST pour tout autre agent ou script. Les deux font la même chose." />
        </div>
        <Segmented<Client>
          label="Client"
          small
          value={client}
          onChange={setClient}
          segments={[
            { value: "claude-code", label: "Claude Code" },
            { value: "claude-desktop", label: "Claude Desktop" },
            { value: "rest", label: "API REST" },
          ]}
        />
        <CopyBlock value={sample[client]} />
        <p className={styles.mono}>
          MCP : {origin}/api/mcp · REST : {origin}/api/v1 · {active.length} clé{active.length > 1 ? "s" : ""} active{active.length > 1 ? "s" : ""}
        </p>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide}>
            {showGuide ? "Masquer les consignes de l'agent" : "Voir les consignes données à l'agent"}
          </Button>
        </div>
        {showGuide && <CopyBlock value={guide} label="Copier les consignes" />}
      </section>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nouvelle clé">
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TextField label="Nom de l'agent" hint="Affiché comme auteur de ses modifications et de ses messages." required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <Segmented<"write" | "read">
            label="Portée"
            value={scope}
            onChange={setScope}
            segments={[
              { value: "write", label: "Lecture et écriture" },
              { value: "read", label: "Lecture seule" },
            ]}
          />
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            Créer la clé
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={!!created}
        onClose={() => setCreated(null)}
        title={`Clé de « ${created?.info.name ?? ""} »`}
        wide
        footer={<Button onClick={() => setCreated(null)}>C&apos;est noté</Button>}
      >
        <p>Copiez-la maintenant : elle ne sera plus jamais affichée.</p>
        {created && <CopyBlock value={created.key} label="Copier la clé" />}
        <Segmented<Client>
          label="Client"
          small
          value={client}
          onChange={setClient}
          segments={[
            { value: "claude-code", label: "Claude Code" },
            { value: "claude-desktop", label: "Claude Desktop" },
            { value: "rest", label: "API REST" },
          ]}
        />
        <CopyBlock value={sample[client]} />
      </Dialog>

      <Dialog
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        title="Révoquer cette clé ?"
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
        <p>« {toRevoke?.name} » perdra l&apos;accès immédiatement. Son travail reste dans les livres et l&apos;historique.</p>
      </Dialog>
    </>
  );
}
