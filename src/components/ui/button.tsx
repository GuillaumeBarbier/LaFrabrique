import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "gold" | "secondary" | "ghost" | "danger";

interface StyleProps {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  iconOnly?: boolean;
  /** Tooltip shown on hover/focus (also the accessible name of an icon-only button). */
  tip?: string;
  tipUp?: boolean;
}

export function buttonClass({ variant = "primary", size = "md", iconOnly, tip, tipUp }: StyleProps, extra?: string): string {
  return [
    styles.btn,
    variant !== "primary" && styles[variant],
    size === "sm" && styles.sm,
    iconOnly && styles.iconOnly,
    tip && styles.tip,
    tipUp && styles.tipUp,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentProps<"button"> & StyleProps & { icon?: ReactNode; loading?: boolean };

export function Button({ variant, size, iconOnly, tip, tipUp, icon, loading, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, iconOnly, tip, tipUp }, [loading && styles.loading, className].filter(Boolean).join(" "))}
      data-tip={tip}
      aria-label={iconOnly ? tip : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon}
      {iconOnly ? null : children}
      {loading && (
        <span className={styles.dots} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      )}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & StyleProps & { icon?: ReactNode };

export function LinkButton({ variant, size, iconOnly, tip, tipUp, icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={buttonClass({ variant, size, iconOnly, tip, tipUp }, className)}
      data-tip={tip}
      aria-label={iconOnly ? tip : undefined}
      {...rest}
    >
      {icon}
      {iconOnly ? null : children}
    </Link>
  );
}

export const tipClass = styles.tip;
