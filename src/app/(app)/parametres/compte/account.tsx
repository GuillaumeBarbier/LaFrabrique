"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import styles from "../settings.module.css";

export function Account({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.show(done);
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void run("profile", () => apiFetch("/api/v1/account", { method: "PATCH", json: profile }), "Compte enregistré");
        }}
      >
        <h2 className={styles.cardTitle}>Compte</h2>
        <div className={styles.formGrid}>
          <TextField label="Prénom" hint="Signe vos modifications et vos messages." required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <TextField label="E-mail" type="email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
        </div>
        <div>
          <Button type="submit" loading={busy === "profile"}>
            Enregistrer
          </Button>
        </div>
      </form>

      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            "password",
            async () => {
              await apiFetch("/api/v1/account/password", { method: "POST", json: pw });
              setPw({ current: "", next: "" });
            },
            "Mot de passe changé",
          );
        }}
      >
        <h2 className={styles.cardTitle}>Mot de passe</h2>
        <div className={styles.formGrid}>
          <TextField label="Actuel" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <TextField label="Nouveau" type="password" autoComplete="new-password" hint="10 caractères au moins." required minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <div>
          <Button type="submit" loading={busy === "password"}>
            Changer le mot de passe
          </Button>
        </div>
      </form>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Sessions</h2>
          <Button
            variant="secondary"
            loading={busy === "sessions"}
            onClick={() =>
              void run("sessions", () => apiFetch("/api/v1/account/sessions", { method: "DELETE" }), "Autres appareils déconnectés")
            }
          >
            Déconnecter les autres appareils
          </Button>
        </div>
      </section>
    </>
  );
}
