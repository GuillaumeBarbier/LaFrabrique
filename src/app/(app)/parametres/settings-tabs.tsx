"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings.module.css";

const TABS = [
  { href: "/parametres/agents", label: "Agents IA" },
  { href: "/parametres/typographies", label: "Typographies" },
  { href: "/parametres/compte", label: "Compte" },
  { href: "/parametres/apparence", label: "Apparence" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label="Sections des paramètres">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={styles.tab} aria-current={pathname.startsWith(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
