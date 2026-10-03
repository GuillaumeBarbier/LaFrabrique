import { errorResponse, resolveActor } from "@/server/http";
import { subscribe } from "@/server/events";
import { getBook } from "@/server/services/books";

export const dynamic = "force-dynamic";

/** Live changes of one book (F1.9), as Server-Sent Events. */
export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const actor = resolveActor(req);
    if (!actor) return Response.json({ error: { code: "unauthorized", message: "Connexion requise." } }, { status: 401 });
    const { bookId } = await ctx.params;
    getBook(bookId);
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        send("retry: 3000\n: connected\n\n");
        const unsubscribe = subscribe(`book:${bookId}`, (event) => send(`event: change\ndata: ${JSON.stringify(event)}\n\n`));
        const ping = setInterval(() => send(": ping\n\n"), 25_000);
        cleanup = () => {
          clearInterval(ping);
          unsubscribe();
        };
        req.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {}
        });
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
