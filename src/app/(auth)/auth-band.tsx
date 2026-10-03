import { Logo } from "@/components/brand/logo";
import styles from "./auth.module.css";

export function AuthBand() {
  return (
    <aside className={styles.band}>
      <Logo size={30} />
      <p className={styles.claim}>
        Une illustration à gauche, <em>une histoire à droite.</em>
      </p>
      <svg className={styles.spread} viewBox="0 0 420 260" aria-hidden>
        <rect x="10" y="20" width="195" height="230" rx="6" fill="var(--color-gold-400)" />
        <circle cx="80" cy="95" r="34" fill="#0a0a0a" opacity="0.85" />
        <path d="M10 200 Q 90 140 205 190 L205 250 L10 250 Z" fill="#0a0a0a" opacity="0.85" />
        <rect x="215" y="20" width="195" height="230" rx="6" fill="#f7f6f2" />
        <rect x="245" y="95" width="130" height="8" rx="4" fill="#0a0a0a" opacity="0.8" />
        <rect x="245" y="115" width="110" height="8" rx="4" fill="#0a0a0a" opacity="0.8" />
        <rect x="245" y="135" width="122" height="8" rx="4" fill="#0a0a0a" opacity="0.8" />
        <rect x="245" y="155" width="70" height="8" rx="4" fill="#0a0a0a" opacity="0.8" />
      </svg>
    </aside>
  );
}
