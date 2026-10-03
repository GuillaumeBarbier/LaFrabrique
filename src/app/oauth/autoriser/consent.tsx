"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { TextField } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client";
import styles from "../../(auth)/auth.module.css";
import consent from "./consent.module.css";

export function Consent({
  params,
  clientName,
  redirectHost,
  loopbackOnly,
  requestedScope,
}: {
  params: Record<string, string>;
  clientName: string;
  redirectHost: string;
  loopbackOnly: boolean;
  requestedScope: "read" | "write";
}) {
  const [name, setName] = useState(clientName);
  const [scope, setScope] = useState<"read" | "write">(requestedScope);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "allow" | "deny") {
    setBusy(decision);
    setError(null);
    try {
      const { redirect } = await apiFetch<{ redirect: string }>("/api/oauth/authorize", {
        method: "POST",
        json: { params, decision, name: name.trim() || clientName, scope },
      });
      window.location.assign(redirect);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void decide("allow");
      }}
    >
      <ShieldCheck size={28} aria-hidden className={consent.icon} />
      <h1 className={styles.title}>Autoriser « {clientName} » ?</h1>
      <p className={styles.sub}>
        Accès à vos livres pour un agent. Retour vers <strong className={consent.host}>{redirectHost}</strong>.
      </p>
      {loopbackOnly && (
        <p className={consent.warning}>Application installée sur un ordinateur : n&apos;autoriser que si vous venez de la lancer.</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <TextField
        label="Nom de l'agent"
        hint="Signe ses modifications et ses messages dans les livres."
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Segmented<"read" | "write">
        label="Portée"
        value={scope}
        onChange={setScope}
        segments={[
          { value: "write", label: "Lire et écrire" },
          { value: "read", label: "Lire seulement" },
        ]}
      />
      <div className={consent.actions}>
        <Button type="submit" loading={busy === "allow"} disabled={busy !== null || !name.trim()}>
          Autoriser
        </Button>
        <Button variant="secondary" loading={busy === "deny"} disabled={busy !== null} onClick={() => void decide("deny")}>
          Refuser
        </Button>
      </div>
      <p className={consent.note}>Révocable à tout moment : Paramètres › Agents IA.</p>
    </form>
  );
}
