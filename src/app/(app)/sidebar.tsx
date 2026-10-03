"use client";

import { BookOpen, LogOut, MessagesSquare, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { apiFetch } from "@/lib/client";
import styles from "./shell.module.css";

const NAV = [
  { href: "/", label: "Bibliothèque", icon: BookOpen, match: (p: string) => p === "/" },
  { href: "/echanges", label: "Échanges", icon: MessagesSquare, match: (p: string) => p.startsWith("/echanges") },
  { href: "/parametres", label: "Paramètres", icon: Settings, match: (p: string) => p.startsWith("/parametres") },
];

export function Sidebar({ userName, waitingForHuman }: { userName: string; waitingForHuman: number }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label="La Fabrique, bibliothèque">
        <Logo size={26} />
      </Link>
      <nav className={styles.nav} aria-label="Navigation principale">
        {NAV.map(({ href, label, icon: Icon, match }) => (
          <Link key={href} href={href} className={styles.navLink} aria-current={match(pathname) ? "page" : undefined} title={label}>
            <Icon aria-hidden />
            <span className={styles.navLabel}>{label}</span>
            {href === "/echanges" && waitingForHuman > 0 && (
              <span className={styles.count} aria-label={`${waitingForHuman} en attente de réponse`}>
                {waitingForHuman}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className={styles.foot}>
        <span className={styles.avatar} aria-hidden>
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.who}>{userName}</span>
        <button
          type="button"
          className={styles.signOut}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          onClick={async () => {
            await apiFetch("/api/auth/logout", { method: "POST" });
            router.replace("/connexion");
            router.refresh();
          }}
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
