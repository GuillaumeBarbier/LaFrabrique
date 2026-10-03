"use client";

import { Check, ChevronDown } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { FieldShell } from "./field";
import styles from "./select.module.css";

export interface SelectOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  group?: string;
  /** Style of the label (e.g. a font preview). */
  style?: CSSProperties;
}

interface SelectProps<V extends string> {
  value: V | null;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  label?: string;
  hint?: string;
  placeholder?: string;
  /** Search box; on by default from 9 options (design brief). */
  searchable?: boolean;
  disabled?: boolean;
  openUp?: boolean;
  renderValue?: (option: SelectOption<V>) => ReactNode;
  className?: string;
}

/** Redesigned listbox: no native <select> (design brief §1.3), keyboard first. */
export function Select<V extends string>({
  value,
  onChange,
  options,
  label,
  hint,
  placeholder = "Choisir…",
  searchable,
  disabled,
  openUp,
  renderValue,
  className,
}: SelectProps<V>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const withSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (withSearch ? searchRef.current : listRef.current)?.focus();
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, withSearch]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(option: SelectOption<V> | undefined) {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") triggerRef.current?.focus();
    }
  }

  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <div className={styles.wrap} ref={wrapRef}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              openList();
            }
          }}
        >
          <span className={[styles.value, !selected && styles.placeholder].filter(Boolean).join(" ")} style={selected?.style}>
            {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
          </span>
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </button>
        {open && (
          <div className={[styles.panel, openUp && styles.panelUp].filter(Boolean).join(" ")}>
            {withSearch && (
              <input
                ref={searchRef}
                className={styles.search}
                placeholder="Rechercher"
                value={query}
                aria-label="Rechercher"
                aria-controls={`${id}-list`}
                aria-activedescendant={filtered[active] ? `${id}-${filtered[active].value}` : undefined}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
              />
            )}
            <ul
              ref={listRef}
              id={`${id}-list`}
              role="listbox"
              tabIndex={-1}
              className={styles.list}
              aria-label={label}
              aria-activedescendant={filtered[active] ? `${id}-${filtered[active].value}` : undefined}
              onKeyDown={onKey}
            >
              {filtered.length === 0 && <li className={styles.empty}>Aucun résultat</li>}
              {filtered.map((o, i) => {
                const header = o.group && o.group !== filtered[i - 1]?.group ? o.group : null;
                return (
                  <li key={o.value} role="presentation">
                    {header && <div className={styles.group}>{header}</div>}
                    <div
                      id={`${id}-${o.value}`}
                      role="option"
                      aria-selected={o.value === value}
                      data-active={i === active}
                      className={styles.option}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(o)}
                    >
                      <span className={styles.optionLabel}>
                        <span style={o.style}>{o.label}</span>
                        {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
                      </span>
                      {o.value === value && <Check size={16} className={styles.check} aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
}
