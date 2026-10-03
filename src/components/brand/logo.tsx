/** La Fabrique mark: an open book, the illustration page in gold, the text page in light. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <path d="M8 16c8-3.5 16-3.5 23 1v32c-7-4.5-15-4.5-23-1z" fill="var(--color-gold-400)" />
      <path d="M33 17c7-4.5 15-4.5 23-1v32c-8-3.5-16-3.5-23 1z" fill="currentColor" />
      <path d="M38.5 26h11M38.5 31.5h11M38.5 37h7.5" stroke="var(--logo-ink, #0a0a0a)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <span style={{ fontWeight: 600, fontSize: size * 0.62, letterSpacing: "-0.02em" }}>La Fabrique</span>
    </span>
  );
}
