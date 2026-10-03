"use client";

import { CircleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import styles from "./field.module.css";

export function Hint({ text, label = "Aide" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={styles.hint}
      aria-label={`${label} : ${text}`}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
    >
      ?
      <span className={styles.bubble} aria-hidden>
        {text}
      </span>
    </button>
  );
}

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  aside?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ id, label, hint, aside, error, children, className }: FieldShellProps) {
  return (
    <div className={[styles.field, error && styles.invalid, className].filter(Boolean).join(" ")}>
      {(label || hint || aside) && (
        <div className={styles.labelRow}>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
            </label>
          )}
          {hint && <Hint text={hint} label={label} />}
          {aside && <span className={styles.aside}>{aside}</span>}
        </div>
      )}
      {children}
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          <CircleAlert size={14} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label?: string;
  hint?: string;
  aside?: ReactNode;
  error?: string | null;
  fieldClassName?: string;
};

export function TextField({ label, hint, aside, error, fieldClassName, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} aside={aside} error={error} className={fieldClassName}>
      <input
        id={id}
        className={[styles.input, className].filter(Boolean).join(" ")}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

type TextAreaProps = Omit<ComponentProps<"textarea">, "id"> & {
  label?: string;
  hint?: string;
  aside?: ReactNode;
  error?: string | null;
  fieldClassName?: string;
};

export function TextArea({ label, hint, aside, error, fieldClassName, className, ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} aside={aside} error={error} className={fieldClassName}>
      <textarea
        id={id}
        className={[styles.textarea, className].filter(Boolean).join(" ")}
        aria-invalid={!!error || undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export const fieldStyles = styles;
