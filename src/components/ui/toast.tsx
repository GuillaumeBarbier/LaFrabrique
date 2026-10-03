"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import styles from "./controls.module.css";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  tone: "default" | "danger";
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, options?: { tone?: "default" | "danger"; action?: ToastAction; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, options = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, tone: options.tone ?? "default", action: options.action }]);
      setTimeout(() => dismiss(id), options.durationMs ?? (options.action ? 7000 : 3500));
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={[styles.toast, t.tone === "danger" && styles.toastDanger].filter(Boolean).join(" ")}>
            {t.tone === "danger" ? (
              <CircleAlert size={18} className={styles.toastIcon} aria-hidden />
            ) : (
              <CircleCheck size={18} className={styles.toastIcon} aria-hidden />
            )}
            <span className={styles.toastText}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
