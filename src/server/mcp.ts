import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import { BOOK_FORMATS, BOOK_STATUSES, getFormat, ILLUSTRATION_FITS, requiredPixels, STATUS_LABELS, TEXT_ALIGNS, TEXT_VALIGNS } from "@/lib/book";
import { FONT_CATALOG } from "@/lib/fonts";
import { AGENT_GUIDE } from "./agent-guide";
import { assetFilePath, decodeBase64, fetchImage, getAsset, storeImage } from "./assets";
import { canWrite, type Actor } from "./http";
import { listActivity } from "./services/activity";
import {
  addSpread,
  createBook,
  createBookSchema,
  createSpreadSchema,
  deleteSpread,
  getBook,
  getSpread,
  listBooks,
  reorderSpreads,
  restoreActivity,
  setCover,
  setIllustration,
  updateBook,
  updateBookSchema,
  updateSpread,
  updateSpreadSchema,
} from "./services/books";
import {
  addCharacterImage,
  characterImageSchema,
  characterReferences,
  createCharacter,
  createCharacterSchema,
  deleteCharacter,
  getCharacter,
  listCharacters,
  removeCharacterImage,
  updateCharacter,
  updateCharacterImage,
  updateCharacterSchema,
} from "./services/characters";
import { createComment, createCommentSchema, listComments, listOpenRequests, setCommentResolved } from "./services/comments";
import { listCustomFonts } from "./services/fonts";
import { HttpError } from "./util";

// MCP server (ADR-0002, F1.6). One server per request (stateless), bound to the caller's
// key: a read-only key simply does not see the writing tools.

type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

async function run(fn: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    const result = await fn();
    return ok(result === undefined ? { ok: true } : result);
  } catch (err) {
    if (err instanceof HttpError) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: err.code, message: err.message, details: err.details }) }] };
    }
    if (err instanceof z.ZodError) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "invalid", details: z.flattenError(err) }) }] };
    }
    console.error(err);
    return { isError: true, content: [{ type: "text", text: "Erreur interne." }] };
  }
}

const bookId = z.string().describe("Identifiant du livre (list_books).");
const spreadId = z.string().describe("Identifiant de la double page (get_book → spreads[].id).");

async function imageBuffer(args: { image_base64?: string; image_url?: string }): Promise<Buffer> {
  if (args.image_base64) return decodeBase64(args.image_base64);
  if (args.image_url) return fetchImage(args.image_url);
  throw new HttpError(400, "bad_request", "Fournir image_base64 ou image_url.");
}

const MAX_INLINE_IMAGES = 12;

export function buildMcpServer(actor: Actor, origin: string): McpServer {
  const server = new McpServer({ name: "la-fabrique", version: "0.1.0" }, { instructions: AGENT_GUIDE });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  // --- reading ---------------------------------------------------------------------------

  server.registerTool(
    "whoami",
    { title: "Qui suis-je", description: "Nom et portée de la clé utilisée.", annotations: readOnly },
    () => run(() => ({ name: actor.name, type: actor.type, scope: actor.scope })),
  );

  server.registerTool(
    "list_books",
    {
      title: "Lister les livres",
      description: "Livres de la bibliothèque, du plus récemment modifié au plus ancien.",
      inputSchema: { filter: z.enum(["all", "active", "done", "archived"]).optional().describe("Défaut : all (hors archivés).") },
      annotations: readOnly,
    },
    ({ filter }) => run(() => listBooks(filter ?? "all")),
  );

  server.registerTool(
    "get_book",
    {
      title: "Lire un livre",
      description:
        "Le livre complet : brief, typographie, format, statut, doubles pages (texte, brief d'illustration, notes), demandes ouvertes. À lire avant toute modification.",
      inputSchema: { book_id: bookId },
      annotations: readOnly,
    },
    ({ book_id }) =>
      run(() => {
        const book = getBook(book_id);
        return { ...book, printPixels: requiredPixels(getFormat(book.format)) };
      }),
  );

  server.registerTool(
    "get_spread",
    { title: "Lire une double page", description: "Une double page et sa version courante.", inputSchema: { book_id: bookId, spread_id: spreadId }, annotations: readOnly },
    ({ book_id, spread_id }) => run(() => getSpread(book_id, spread_id)),
  );

  server.registerTool(
    "view_illustration",
    {
      title: "Voir une illustration",
      description: "Renvoie l'image (version écran) d'une double page, ou la couverture si spread_id est omis.",
      inputSchema: { book_id: bookId, spread_id: spreadId.optional() },
      annotations: readOnly,
    },
    async ({ book_id, spread_id }) => {
      try {
        const assetId = spread_id ? getSpread(book_id, spread_id).illustration?.id : getBook(book_id).cover?.id;
        if (!assetId) return ok("Pas d'image ici.");
        const { file } = assetFilePath(getAsset(assetId), "web");
        return { content: [{ type: "image", data: fs.readFileSync(file).toString("base64"), mimeType: "image/webp" }] };
      } catch (err) {
        return run(() => {
          throw err;
        });
      }
    },
  );

  server.registerTool(
    "list_characters",
    {
      title: "Personnages du livre",
      description: "Fiches des personnages : nom, rôle, apparence, images de référence (étiquette, principale).",
      inputSchema: { book_id: bookId },
      annotations: readOnly,
    },
    ({ book_id }) => run(() => listCharacters(book_id)),
  );

  server.registerTool(
    "get_references",
    {
      title: "Références pour illustrer",
      description:
        "À appeler AVANT de produire une illustration : les personnages présents sur la double page (ou ceux demandés, ou tous), leur apparence, et leurs images de référence — affichées ici et en liens téléchargeables sans clé pendant 24 h (signedUrl) à transmettre à un générateur d'images.",
      inputSchema: {
        book_id: bookId,
        spread_id: spreadId.optional().describe("Double page à illustrer : seuls ses personnages."),
        character_ids: z.array(z.string()).optional(),
        images: z.enum(["primary", "all", "none"]).optional().describe("Images à afficher ici. Défaut : primary (la principale de chaque personnage)."),
      },
      annotations: readOnly,
    },
    async ({ book_id, spread_id, character_ids, images }) => {
      try {
        const refs = characterReferences(book_id, { origin, spreadId: spread_id, characterIds: character_ids });
        const mode = images ?? "primary";
        const shown = mode === "none" ? [] : refs.characters.flatMap((c) => c.images.filter((i) => mode === "all" || i.primary).map((i) => ({ c, i })));
        const content: ToolResult["content"] = [{ type: "text", text: JSON.stringify(refs, null, 2) }];
        const assetOf = new Map(listCharacters(book_id).flatMap((c) => c.images.map((x) => [x.id, x.image.id] as const)));
        for (const { c, i } of shown.slice(0, MAX_INLINE_IMAGES)) {
          const assetId = assetOf.get(i.id);
          if (!assetId) continue;
          const { file } = assetFilePath(getAsset(assetId), "web");
          content.push({ type: "text", text: `${c.name}${i.label ? ` — ${i.label}` : ""}${i.primary ? " (principale)" : ""}` });
          content.push({ type: "image", data: fs.readFileSync(file).toString("base64"), mimeType: "image/webp" });
        }
        return { content };
      } catch (err) {
        return run(() => {
          throw err;
        });
      }
    },
  );

  server.registerTool(
    "list_requests",
    {
      title: "Demandes ouvertes",
      description: "Demandes de Guillaume qui te sont adressées et pas encore résolues, avec leurs réponses. À traiter en priorité.",
      inputSchema: { book_id: bookId.optional().describe("Limiter à un livre.") },
      annotations: readOnly,
    },
    ({ book_id }) => run(() => listOpenRequests("agent", book_id)),
  );

  server.registerTool(
    "list_comments",
    {
      title: "Lire les échanges",
      description: "Fils de discussion d'un livre (ou d'une double page).",
      inputSchema: { book_id: bookId, spread_id: spreadId.optional(), open_only: z.boolean().optional() },
      annotations: readOnly,
    },
    ({ book_id, spread_id, open_only }) => run(() => listComments(book_id, { spreadId: spread_id, openOnly: open_only })),
  );

  server.registerTool(
    "list_activity",
    {
      title: "Historique",
      description: "Qui a modifié quoi, quand. Les entrées restaurables portent restorable=true.",
      inputSchema: { book_id: bookId, spread_id: spreadId.optional(), limit: z.number().int().min(1).max(200).optional() },
      annotations: readOnly,
    },
    ({ book_id, spread_id, limit }) => run(() => listActivity(book_id, { spreadId: spread_id, limit })),
  );

  server.registerTool(
    "list_fonts",
    { title: "Polices disponibles", description: "Clés utilisables dans la typographie du livre (catalogue et polices perso).", annotations: readOnly },
    () => run(() => ({ catalog: FONT_CATALOG, custom: listCustomFonts() })),
  );

  server.registerTool(
    "list_formats",
    { title: "Formats et statuts", description: "Formats de livre, statuts et pixels requis pour l'impression.", annotations: readOnly },
    () =>
      run(() => ({
        formats: BOOK_FORMATS.map((f) => ({ ...f, printPixels: requiredPixels(f) })),
        statuses: BOOK_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
      })),
  );

  if (!canWrite(actor)) return server;

  // --- writing ---------------------------------------------------------------------------

  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "create_book",
    {
      title: "Créer un livre",
      description: "Crée un livre (statut « Idée ») avec des doubles pages vides (12 par défaut).",
      inputSchema: createBookSchema.shape,
      annotations: write,
    },
    (args) => run(() => createBook(createBookSchema.parse(args), actor)),
  );

  server.registerTool(
    "update_book",
    {
      title: "Modifier un livre",
      description:
        "Métadonnées, brief, statut (idea, writing, illustrating, review, done), format, typographie (clés de list_fonts), archivage. Seuls les champs fournis changent.",
      inputSchema: { book_id: bookId, ...updateBookSchema.shape },
      annotations: write,
    },
    ({ book_id, ...patch }) => run(() => updateBook(book_id, updateBookSchema.parse(patch), actor)),
  );

  server.registerTool(
    "add_spread",
    {
      title: "Ajouter une double page",
      description: "Insère une double page (à la fin par défaut, ou à `position`, 0 = première).",
      inputSchema: { book_id: bookId, ...createSpreadSchema.shape },
      annotations: write,
    },
    ({ book_id, ...input }) => run(() => addSpread(book_id, createSpreadSchema.parse(input), actor)),
  );

  server.registerTool(
    "update_spread",
    {
      title: "Modifier une double page",
      description:
        "Texte (page de droite, texte brut, ligne vide = paragraphe), brief d'illustration, notes, cadrage, ajustements de mise en page (null = valeur du livre). Passer baseVersion (version lue) pour éviter d'écraser une saisie de Guillaume.",
      inputSchema: {
        book_id: bookId,
        spread_id: spreadId,
        text: z.string().max(10_000).optional(),
        illustrationBrief: z.string().max(5_000).optional(),
        illustrationFit: z.enum(ILLUSTRATION_FITS).optional(),
        notes: z.string().max(5_000).optional(),
        textAlign: z.enum(TEXT_ALIGNS).nullable().optional(),
        textValign: z.enum(TEXT_VALIGNS).nullable().optional(),
        textSizePt: z.number().min(6).max(96).nullable().optional(),
        pageColor: z.string().nullable().optional().describe("#RRGGBB"),
        characterIds: z.array(z.string()).optional().describe("Personnages présents sur la double page (ids de list_characters)."),
        baseVersion: z.number().int().optional(),
      },
      annotations: write,
    },
    ({ book_id, spread_id, ...patch }) => run(() => updateSpread(book_id, spread_id, updateSpreadSchema.parse(patch), actor)),
  );

  server.registerTool(
    "delete_spread",
    {
      title: "Supprimer une double page",
      description: "Supprime une double page (restaurable depuis l'historique).",
      inputSchema: { book_id: bookId, spread_id: spreadId },
      annotations: { ...write, destructiveHint: true },
    },
    ({ book_id, spread_id }) => run(() => deleteSpread(book_id, spread_id, actor)),
  );

  server.registerTool(
    "reorder_spreads",
    {
      title: "Réordonner les doubles pages",
      description: "Nouvel ordre complet : chaque spread_id du livre une fois.",
      inputSchema: { book_id: bookId, order: z.array(z.string()).max(200) },
      annotations: write,
    },
    ({ book_id, order }) => run(() => reorderSpreads(book_id, order, actor)),
  );

  const imageInput = {
    image_base64: z.string().optional().describe("Image encodée en base64 (JPEG, PNG, WebP, AVIF, GIF, TIFF)."),
    image_url: z.string().optional().describe("Ou une adresse https publique de l'image."),
    file_name: z.string().max(200).optional(),
  };

  server.registerTool(
    "set_illustration",
    {
      title: "Déposer l'illustration",
      description: "Pose l'image de la page de gauche d'une double page. L'original est gardé pour l'impression.",
      inputSchema: { book_id: bookId, spread_id: spreadId, ...imageInput },
      annotations: write,
    },
    (args) =>
      run(async () => {
        getSpread(args.book_id, args.spread_id);
        const asset = await storeImage(await imageBuffer(args), { kind: "illustration", bookId: args.book_id, originalName: args.file_name, actor });
        return setIllustration(args.book_id, args.spread_id, asset, actor);
      }),
  );

  server.registerTool(
    "remove_illustration",
    {
      title: "Retirer l'illustration",
      description: "Retire l'image d'une double page (restaurable).",
      inputSchema: { book_id: bookId, spread_id: spreadId },
      annotations: write,
    },
    ({ book_id, spread_id }) => run(() => setIllustration(book_id, spread_id, null, actor)),
  );

  server.registerTool(
    "set_cover",
    { title: "Déposer la couverture", description: "Image de couverture du livre.", inputSchema: { book_id: bookId, ...imageInput }, annotations: write },
    (args) =>
      run(async () => {
        getBook(args.book_id);
        const asset = await storeImage(await imageBuffer(args), { kind: "cover", bookId: args.book_id, originalName: args.file_name, actor });
        return setCover(args.book_id, asset, actor);
      }),
  );

  server.registerTool(
    "create_character",
    {
      title: "Créer un personnage",
      description: "Nouvelle fiche : nom, rôle dans l'histoire, apparence décrite en mots (couleurs, vêtements, signes distinctifs).",
      inputSchema: { book_id: bookId, ...createCharacterSchema.shape },
      annotations: write,
    },
    ({ book_id, ...input }) => run(() => createCharacter(book_id, createCharacterSchema.parse(input), actor)),
  );

  server.registerTool(
    "update_character",
    {
      title: "Modifier un personnage",
      description: "Nom, rôle, apparence ou ordre (position). Seuls les champs fournis changent.",
      inputSchema: { book_id: bookId, character_id: z.string(), ...updateCharacterSchema.shape },
      annotations: write,
    },
    ({ book_id, character_id, ...patch }) => run(() => updateCharacter(book_id, character_id, updateCharacterSchema.parse(patch), actor)),
  );

  server.registerTool(
    "delete_character",
    {
      title: "Supprimer un personnage",
      description: "Supprime la fiche et la retire des doubles pages (restaurable depuis l'historique).",
      inputSchema: { book_id: bookId, character_id: z.string() },
      annotations: { ...write, destructiveHint: true },
    },
    ({ book_id, character_id }) => run(() => deleteCharacter(book_id, character_id, actor)),
  );

  server.registerTool(
    "add_character_image",
    {
      title: "Ajouter une image de référence",
      description:
        "Image d'un personnage (planche, face, profil, expression…). label = ce qu'elle montre. primary = image à utiliser en premier (la première ajoutée l'est d'office).",
      inputSchema: {
        book_id: bookId,
        character_id: z.string(),
        ...imageInput,
        label: z.string().max(80).optional(),
        primary: z.boolean().optional(),
      },
      annotations: write,
    },
    (args) =>
      run(async () => {
        getCharacter(args.book_id, args.character_id);
        const input = characterImageSchema.parse({ label: args.label, primary: args.primary });
        const asset = await storeImage(await imageBuffer(args), { kind: "character", bookId: args.book_id, originalName: args.file_name, actor });
        return addCharacterImage(args.book_id, args.character_id, asset, input, actor);
      }),
  );

  server.registerTool(
    "update_character_image",
    {
      title: "Légender une image de référence",
      description: "Change l'étiquette ou fait de l'image la référence principale.",
      inputSchema: { book_id: bookId, character_id: z.string(), image_id: z.string(), ...characterImageSchema.shape },
      annotations: write,
    },
    ({ book_id, character_id, image_id, ...patch }) =>
      run(() => updateCharacterImage(book_id, character_id, image_id, characterImageSchema.parse(patch), actor)),
  );

  server.registerTool(
    "remove_character_image",
    {
      title: "Retirer une image de référence",
      description: "Retire l'image de la fiche (restaurable).",
      inputSchema: { book_id: bookId, character_id: z.string(), image_id: z.string() },
      annotations: write,
    },
    ({ book_id, character_id, image_id }) => run(() => removeCharacterImage(book_id, character_id, image_id, actor)),
  );

  server.registerTool(
    "post_comment",
    {
      title: "Écrire un message",
      description:
        "Message dans les échanges du livre. parentId = répondre à un fil (ex. une demande traitée). addressedTo='human' pour une question ou une proposition à Guillaume.",
      inputSchema: { book_id: bookId, ...createCommentSchema.shape },
      annotations: write,
    },
    ({ book_id, ...input }) => run(() => createComment(book_id, createCommentSchema.parse(input), actor)),
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Résoudre une demande",
      description: "Marque un fil comme résolu (ou le rouvre avec resolved=false).",
      inputSchema: { comment_id: z.string(), resolved: z.boolean().optional() },
      annotations: write,
    },
    ({ comment_id, resolved }) => run(() => setCommentResolved(comment_id, resolved ?? true, actor)),
  );

  server.registerTool(
    "restore_version",
    {
      title: "Restaurer une version",
      description: "Remet l'état d'avant une entrée d'historique (list_activity, restorable=true). La restauration est elle-même réversible.",
      inputSchema: { activity_id: z.string() },
      annotations: write,
    },
    ({ activity_id }) => run(() => restoreActivity(activity_id, actor)),
  );

  return server;
}
