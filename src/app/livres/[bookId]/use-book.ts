"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch, CLIENT_ID } from "@/lib/client";
import type { Book, Spread } from "@/lib/types";

// Book state for the editor (F1.9): live refresh from the server's event stream, queued
// saves per spread, and conflict detection when the agent wrote the same page meanwhile.

export type SpreadPatch = Partial<
  Pick<
    Spread,
    "text" | "illustrationBrief" | "illustrationFit" | "notes" | "textAlign" | "textValign" | "textSizePt" | "pageColor" | "characterIds"
  >
>;

export interface Conflict {
  spreadId: string;
  mine: SpreadPatch;
  theirs: Spread;
}

export interface LiveSignal {
  name: string;
  type: "human" | "agent";
  at: number;
  spreadId?: string;
}

const SAVE_DELAY_MS = 700;

/**
 * Save queue, outside React: one request in flight per spread, edits made meanwhile are
 * merged and sent next. `baseVersion` is the version the local edits are based on — it only
 * moves forward with our own saves, so a remote change makes the next save conflict.
 */
class SpreadSaver {
  private baseVersion = new Map<string, number>();
  private pending = new Map<string, SpreadPatch>();
  private inFlight = new Set<string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly bookId: string,
    private readonly setBook: Dispatch<SetStateAction<Book>>,
    private readonly setConflict: (c: Conflict | null) => void,
    private readonly setSaving: Dispatch<SetStateAction<number>>,
    spreads: Spread[],
  ) {
    for (const s of spreads) this.baseVersion.set(s.id, s.version);
  }

  isDirty(id: string): boolean {
    return this.pending.has(id) || this.inFlight.has(id);
  }

  hasUnsaved(): boolean {
    return this.pending.size > 0 || this.inFlight.size > 0;
  }

  pendingPatch(id: string): SpreadPatch | undefined {
    return this.pending.get(id);
  }

  /** A fresh server copy: clean spreads move their base forward, dirty ones keep theirs. */
  sync(spreads: Spread[]): void {
    for (const s of spreads) if (!this.isDirty(s.id)) this.baseVersion.set(s.id, s.version);
  }

  edit(id: string, patch: SpreadPatch, immediate: boolean): void {
    this.pending.set(id, { ...this.pending.get(id), ...patch });
    if (immediate) void this.flush(id);
    else this.schedule(id, SAVE_DELAY_MS);
  }

  private schedule(id: string, delay: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.flush(id);
      }, delay),
    );
  }

  rebase(id: string, version: number): void {
    this.baseVersion.set(id, version);
  }

  drop(id: string): void {
    this.pending.delete(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  flushAll(): void {
    for (const id of [...this.pending.keys()]) void this.flush(id);
  }

  async flush(id: string): Promise<void> {
    // In flight: the `finally` below sends what accumulated meanwhile.
    if (this.inFlight.has(id)) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const patch = this.pending.get(id);
    if (!patch) return;
    this.pending.delete(id);
    this.inFlight.add(id);
    this.setSaving((n) => n + 1);
    try {
      const saved = await apiFetch<Spread>(`/api/v1/books/${this.bookId}/spreads/${id}`, {
        method: "PATCH",
        json: { ...patch, baseVersion: this.baseVersion.get(id) },
      });
      this.baseVersion.set(id, saved.version);
      // Edits typed while the request was in flight stay on top of the saved state.
      const later = this.pending.get(id);
      this.setBook((prev) => ({ ...prev, spreads: prev.spreads.map((s) => (s.id === id ? { ...saved, ...later } : s)) }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        const theirs = (err.details as { current: Spread }).current;
        const mine = { ...patch, ...this.pending.get(id) };
        this.pending.delete(id);
        this.setConflict({ spreadId: id, mine, theirs });
      } else {
        // Keep the edit, retry in a few seconds.
        this.pending.set(id, { ...patch, ...this.pending.get(id) });
        this.schedule(id, 4000);
      }
    } finally {
      this.inFlight.delete(id);
      this.setSaving((n) => n - 1);
      if (this.pending.has(id) && !this.timers.has(id)) void this.flush(id);
    }
  }
}

export function useBook(initial: Book) {
  const router = useRouter();
  const [book, setBook] = useState<Book>(initial);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [saving, setSaving] = useState(0);
  const [live, setLive] = useState<LiveSignal | null>(null);
  const [eventTick, setEventTick] = useState(0);
  const [saver] = useState(() => new SpreadSaver(initial.id, setBook, setConflict, setSaving, initial.spreads));

  const applyBook = useCallback(
    (next: Book) => {
      saver.sync(next.spreads);
      setBook((prev) => ({
        ...next,
        // A page being typed keeps its local edits: the conflict surfaces at the next save.
        spreads: next.spreads.map((s) => {
          if (!saver.isDirty(s.id)) return s;
          const local = prev.spreads.find((p) => p.id === s.id);
          return local ? { ...s, ...saver.pendingPatch(s.id), text: local.text } : s;
        }),
      }));
    },
    [saver],
  );

  const reload = useCallback(async () => {
    try {
      applyBook(await apiFetch<Book>(`/api/v1/books/${initial.id}`));
    } catch {
      /* offline for a moment: the next event retries */
    }
  }, [applyBook, initial.id]);

  // Live events.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(`/api/v1/books/${initial.id}/events`);
    source.addEventListener("change", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as {
        type: string;
        clientId?: string;
        spreadId?: string;
        actor: { type: "human" | "agent"; name: string };
      };
      if (event.type === "deleted") {
        router.push("/");
        return;
      }
      setEventTick((t) => t + 1);
      if (event.clientId === CLIENT_ID) return;
      setLive({ name: event.actor.name, type: event.actor.type, at: Date.now(), spreadId: event.spreadId });
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 250);
    });
    source.onopen = () => void reload();
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [initial.id, reload, router]);

  /** Local update now, server save after a short pause. */
  const editSpread = useCallback(
    (spreadId: string, patch: SpreadPatch, immediate = false) => {
      setBook((prev) => ({ ...prev, spreads: prev.spreads.map((s) => (s.id === spreadId ? { ...s, ...patch } : s)) }));
      saver.edit(spreadId, patch, immediate);
    },
    [saver],
  );

  const resolveConflict = useCallback(
    (keep: "mine" | "theirs") => {
      if (!conflict) return;
      const { spreadId, mine, theirs } = conflict;
      saver.rebase(spreadId, theirs.version);
      setConflict(null);
      if (keep === "mine") {
        editSpread(spreadId, mine, true);
      } else {
        saver.drop(spreadId);
        setBook((prev) => ({ ...prev, spreads: prev.spreads.map((s) => (s.id === spreadId ? theirs : s)) }));
      }
    },
    [conflict, editSpread, saver],
  );

  // Never leave with unsaved text.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saver.hasUnsaved()) {
        saver.flushAll();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saver]);

  const updateBook = useCallback(
    async (patch: Record<string, unknown>) => {
      const next = await apiFetch<Book>(`/api/v1/books/${initial.id}`, { method: "PATCH", json: patch });
      applyBook(next);
      return next;
    },
    [applyBook, initial.id],
  );

  return { book, applyBook, reload, editSpread, updateBook, conflict, resolveConflict, saving: saving > 0, live, eventTick };
}
