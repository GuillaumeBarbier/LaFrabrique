"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui/controls";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/theme";
import styles from "../settings.module.css";

export function Appearance({ theme }: { theme: ThemeChoice }) {
  const [value, setValue] = useState(theme);
  function choose(next: ThemeChoice) {
    setValue(next);
    const root = document.documentElement;
    if (next === "auto") {
      root.removeAttribute("data-theme");
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      root.setAttribute("data-theme", next);
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Thème de l&apos;interface</h2>
      </div>
      <Segmented<ThemeChoice>
        label="Thème"
        value={value}
        onChange={choose}
        segments={[
          { value: "auto", label: "Automatique", icon: <Monitor /> },
          { value: "light", label: "Clair", icon: <Sun /> },
          { value: "dark", label: "Sombre", icon: <Moon /> },
        ]}
      />
      <p className={styles.muted}>Les livres gardent leurs couleurs.</p>
    </section>
  );
}
