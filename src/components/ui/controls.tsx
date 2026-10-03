"use client";

import { Check, Copy, Minus, MoreHorizontal, Plus, X } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "./button";
import { Hint } from "./field";
import styles from "./controls.module.css";

// ---------------------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel}>
        <span id={id}>{label}</span>
        {hint && <Hint text={hint} label={label} />}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className={styles.switch}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------------------

export interface Segment<V extends string> {
  value: V;
  label: string;
  icon?: ReactNode;
  count?: number;
  /** Icon-only segment: label becomes the tooltip / accessible name. */
  iconOnly?: boolean;
}

export function Segmented<V extends string>({
  value,
  onChange,
  segments,
  label,
  small,
}: {
  value: V;
  onChange: (value: V) => void;
  segments: readonly Segment<V>[];
  label: string;
  small?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(delta: number) {
    const i = segments.findIndex((s) => s.value === value);
    const next = segments[(i + delta + segments.length) % segments.length];
    if (next) {
      onChange(next.value);
      refs.current[segments.indexOf(next)]?.focus();
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={[styles.segmented, small && styles.segmentSm].filter(Boolean).join(" ")}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {segments.map((s, i) => (
        <button
          key={s.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={s.value === value}
          aria-label={s.iconOnly ? s.label : undefined}
          title={s.iconOnly ? s.label : undefined}
          tabIndex={s.value === value ? 0 : -1}
          className={styles.segment}
          onClick={() => onChange(s.value)}
        >
          {s.icon}
          {!s.iconOnly && s.label}
          {s.count !== undefined && <span className={styles.segmentCount}>{s.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={[styles.dialog, wide && styles.dialogWide].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.dialogHead}>
            <h2 id={titleId} className={styles.dialogTitle}>
              {title}
            </h2>
            <Button variant="ghost" size="sm" iconOnly tip="Fermer" icon={<X />} onClick={onClose} />
          </div>
          <div className={styles.dialogBody}>{children}</div>
          {footer && <div className={styles.dialogFoot}>{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------------------
// Menu ("…")
// ---------------------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function Menu({
  items,
  label = "Plus d'actions",
  align = "right",
  trigger,
}: {
  items: MenuItem[];
  label?: string;
  align?: "left" | "right";
  trigger?: (props: { onClick: () => void; "aria-expanded": boolean }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className={styles.menuWrap} ref={wrap}>
      {trigger ? (
        trigger({ onClick: () => setOpen((v) => !v), "aria-expanded": open })
      ) : (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          tip={label}
          icon={<MoreHorizontal />}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
        />
      )}
      {open && (
        <div
          role="menu"
          className={[styles.menu, align === "left" && styles.menuLeft].filter(Boolean).join(" ")}
          onKeyDown={(e) => {
            const els = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
            const i = els.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              els[(i + 1) % els.length]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              els[(i - 1 + els.length) % els.length]?.focus();
            }
          }}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <div className={styles.menuSep} />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={[styles.menuItem, item.danger && styles.menuItemDanger].filter(Boolean).join(" ")}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------------------

export type BadgeTone = "neutral" | "signal" | "gold" | "warning" | "success" | "agent";

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`${styles.badge} ${styles[`tone-${tone}`]}`} title={title}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// Colour field: swatches + hex (no native colour picker)
// ---------------------------------------------------------------------------------------

export function ColorField({
  label,
  value,
  onChange,
  swatches,
  hint,
  allowReset,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  swatches: readonly string[];
  hint?: string;
  allowReset?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value ?? "");
  }
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  return (
    <div className={styles.colorField}>
      <span className={styles.switchLabel}>
        {label}
        {hint && <Hint text={hint} label={label} />}
      </span>
      <div className={styles.swatches}>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.swatch}
            style={{ background: c }}
            aria-label={c}
            title={c}
            aria-pressed={value?.toLowerCase() === c.toLowerCase()}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          className={styles.hexInput}
          value={draft}
          placeholder={allowReset ? "Livre" : "#RRGGBB"}
          aria-label={`${label} (code hexadécimal)`}
          aria-invalid={draft !== "" && !valid}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value.replace(/#/g, "")}`;
            setDraft(e.target.value === "" ? "" : v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
          }}
        />
        {allowReset && value && (
          <Button variant="ghost" size="sm" iconOnly tip="Couleur du livre" icon={<X />} onClick={() => onChange(null)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Stepper (+/−), for sizes in points and line heights
// ---------------------------------------------------------------------------------------

export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (value: number) => string;
  hint?: string;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className={styles.colorField}>
      <span className={styles.switchLabel}>
        {label}
        {hint && <Hint text={hint} label={label} />}
      </span>
      <div className={styles.stepper} role="group" aria-label={label}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={`Diminuer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, round(value - step)))}
        >
          <Minus size={14} />
        </button>
        <span className={styles.stepValue} aria-live="polite">
          {format(value)}
        </span>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={`Augmenter ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, round(value + step)))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Dropzone (file input hidden, keyboard reachable)
// ---------------------------------------------------------------------------------------

export function Dropzone({
  accept,
  onFile,
  children,
  label,
}: {
  accept: string;
  onFile: (file: File) => void;
  children: ReactNode;
  label: string;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className={styles.dropzone}
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="visually-hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------------------
// Copy block
// ---------------------------------------------------------------------------------------

export function CopyBlock({ value, label = "Copier" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }, [value]);
  return (
    <div className={styles.copy}>
      <pre>{value}</pre>
      <button type="button" className={styles.copyBtn} onClick={copy} aria-label={done ? "Copié" : label} title={done ? "Copié" : label}>
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Empty state, skeleton
// ---------------------------------------------------------------------------------------

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {text && <p className={styles.emptyText}>{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton(props: ComponentProps<"div">) {
  return <div {...props} className={[styles.skeleton, props.className].filter(Boolean).join(" ")} aria-hidden />;
}
