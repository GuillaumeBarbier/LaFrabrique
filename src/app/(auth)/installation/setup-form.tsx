"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client";
import styles from "../auth.module.css";

export function SetupForm({ needsToken }: { needsToken: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", setupToken: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/setup", {
        method: "POST",
        json: { ...form, setupToken: needsToken ? form.setupToken : undefined },
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h1 className={styles.title}>Bienvenue dans La Fabrique</h1>
      <p className={styles.sub}>Créer le compte de l&apos;atelier.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <TextField label="Prénom" autoComplete="given-name" required value={form.name} onChange={set("name")} />
      <TextField label="E-mail" type="email" autoComplete="username" required value={form.email} onChange={set("email")} />
      <TextField
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="10 caractères au moins."
        value={form.password}
        onChange={set("password")}
      />
      {needsToken && (
        <TextField
          label="Code d'installation"
          required
          hint="La valeur de SETUP_TOKEN dans le fichier .env du serveur."
          value={form.setupToken}
          onChange={set("setupToken")}
        />
      )}
      <Button type="submit" loading={busy}>
        Créer le compte
      </Button>
    </form>
  );
}
