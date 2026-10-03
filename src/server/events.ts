import { EventEmitter } from "node:events";
import type { Actor } from "./http";

// Live events per book (F1.9). In-memory: one process serves everything (ADR-0001).

export type BookEventType = "book" | "spreads" | "spread" | "comments" | "activity" | "deleted";

export interface BookEvent {
  type: BookEventType;
  bookId: string;
  spreadId?: string;
  actor: { type: Actor["type"]; name: string };
  clientId?: string;
  at: string;
}

const globalForBus = globalThis as unknown as { __lafabriqueBus?: EventEmitter };

function bus(): EventEmitter {
  if (!globalForBus.__lafabriqueBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForBus.__lafabriqueBus = emitter;
  }
  return globalForBus.__lafabriqueBus;
}

export function publish(type: BookEventType, bookId: string, actor: Actor, spreadId?: string): void {
  const event: BookEvent = {
    type,
    bookId,
    spreadId,
    actor: { type: actor.type, name: actor.name },
    clientId: actor.clientId,
    at: new Date().toISOString(),
  };
  bus().emit(`book:${bookId}`, event);
  bus().emit("library", event);
}

export function subscribe(channel: string, listener: (event: BookEvent) => void): () => void {
  bus().on(channel, listener);
  return () => bus().off(channel, listener);
}
