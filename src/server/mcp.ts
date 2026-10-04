import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import { z } from "zod";
import { BOOK_FORMATS, BOOK_STATUSES, getFormat, ILLUSTRATION_FITS, requiredPixels, STATUS_LABELS, TEXT_ALIGNS, TEXT_VALIGNS } from "@/lib/book";
import { camelKeys, snakeKeys, toSnake } from "@/lib/case";
import { FONT_CATALOG } from "@/lib/fonts";
import type { Character } from "@/lib/types";
import { IMAGE_VIEWS } from "@/lib/views";
import { QUOTE_STYLES } from "@/lib/writing";
import { agentInstructions } from "./agent-guide";
import { assetFilePath, decodeBase64, fetchImage, getAsset, storeImage } from "./assets";
import { contactSheet } from "./contact-sheet";
import { canWrite, type Actor } from "./http";
import { listActivity } from "./services/activity";
import {
  addSpread,
  cloneBookSchema,
  cloneBookSetup,
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
  updateBookSchema,
  updateBookWithChanges,
  updateSpread,
  updateSpreadSchema,
} from "./services/books";
import {
  addCharacterImages,
  characterImageAsset,
  characterImageSchema,
  characterOfBook,
  characterReferences,
  characterRow,
  createCharacterSchema,
  deleteCharacter,
  getCharacter,
  listCharacters,
  listOwnerCharacters,
  removeCharacterImage,
  reorderCharacters,
  updateCharacter,
  updateCharacterImage,
  updateCharacterSchema,
  type Owner,
} from "./services/characters";
import { createComment, createCommentSchema, listComments, listOpenRequests, setCommentResolved } from "./services/comments";
import { listCustomFonts } from "./services/fonts";
import { BOOK_SECTIONS, presentBook, presentCharacter, presentSpread } from "./services/present";
import { createSeries, createSeriesSchema, getSeries, listSeries, updateSeries, updateSeriesSchema } from "./services/series";
import { listShares } from "./services/shares";
import { checkText } from "./services/text-check";
import {
  addCharacterImageFromUpload,
  commitUploads,
  createCharacterWithUploads,
  createUploads,
  createUploadsSchema,
  imageReport,
  setCoverFromUpload,
  setIllustrationFromUpload,
  UPLOAD_KINDS,
} from "./services/uploads";
import { badRequest, HttpError } from "./util";

// MCP server (ADR-0002, F1.6, ADR-0008). One server per request (stateless), bound to the
// caller: a read-only key does not see the writing tools. Every tool takes snake_case
// parameters, rejects unknown ones with the expected name, and answers in snake_case;
// writing tools answer short unless `verbose: true`.

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };

/** Maps keyed by data (view names, field names in errors) keep their keys. */
const DATA_MAPS = ["byView", "fieldErrors"];

function text(data: unknown): Content {
  return { type: "text", text: typeof data === "string" ? data : JSON.stringify(snakeKeys(data, DATA_MAPS)) };
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.length ? `${i.path.map((p) => toSnake(String(p))).join(".")} : ` : ""}${i.message}`).join(" ; ");
}

function failure(err: unknown): ToolResult {
  if (err instanceof HttpError) return { isError: true, content: [text({ error: err.code, message: err.message, details: err.details })] };
  if (err instanceof z.ZodError) return { isError: true, content: [text({ error: "invalid", message: zodMessage(err) })] };
  console.error(err);
  return { isError: true, content: [text({ error: "internal", message: "Erreur interne." })] };
}

async function run(fn: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    const result = await fn();
    return { content: [text(result === undefined ? { ok: true } : result)] };
  } catch (err) {
    return failure(err);
  }
}

async function runContent(fn: () => Promise<Content[]> | Content[]): Promise<ToolResult> {
  try {
    return { content: await fn() };
  } catch (err) {
    return failure(err);
  }
}

/**
 * A strict input: an unknown parameter is an error naming the expected one (ageMin → age_min),
 * instead of being dropped in silence.
 */
function input<S extends z.ZodRawShape>(shape: S) {
  const names = Object.keys(shape);
  return z.strictObject(shape, {
    error: (issue) => {
      if (issue.code !== "unrecognized_keys") return undefined;
      const hints = issue.keys.map((k) => {
        const snake = toSnake(k).toLowerCase();
        return names.includes(snake) && snake !== k ? `${k} (→ ${snake})` : k;
      });
      return `Paramètre${issue.keys.length > 1 ? "s" : ""} inconnu${issue.keys.length > 1 ? "s" : ""} : ${hints.join(", ")}. Paramètres acceptés : ${names.join(", ")}.`;
    },
  });
}

/** snake_case args → camelCase input for the service schemas, without the MCP-only fields. */
function service(args: Record<string, unknown>, ...omit: string[]): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(args).filter(([k]) => !omit.includes(k) && k !== "verbose"));
  return camelKeys(rest);
}

const id = (what: string) => z.string().max(40).describe(what);
const bookId = id("Livre (list_books).");
const seriesId = id("Série (list_series).");
const spreadId = id("Double page (get_book → spreads[].id).");
const characterId = id("Personnage (list_characters).");
const verbose = z.boolean().optional().describe("true : renvoie l'objet complet au lieu de la réponse courte.");
const age = z.number().int().min(0).max(18).nullable();
const viewDescription = `Vue normalisée : ${IMAGE_VIEWS.join(", ")} ou expression:<nom>. Déduite de label si absente.`;

const typographyInput = input({
  title_font: z.string().optional(),
  body_font: z.string().optional(),
  title_size_pt: z.number().optional(),
  body_size_pt: z.number().optional(),
  line_height: z.number().optional(),
  text_color: z.string().optional().describe("#RRGGBB"),
  page_color: z.string().optional().describe("#RRGGBB"),
  text_align: z.enum(TEXT_ALIGNS).optional(),
  text_valign: z.enum(TEXT_VALIGNS).optional(),
}).describe("Clés de police : list_fonts. Seuls les champs fournis changent.");

const rulesInput = {
  illustration_style: z.string().max(10_000).optional().describe("Style d'illustration (technique, palette, trait…), donné au générateur avec chaque image."),
  writing_rules: z.string().max(10_000).optional().describe("Règles d'écriture libres (ton, vocabulaire, prénoms : « toujours Mama, jamais Maman »…)."),
  quote_style: z.enum(QUOTE_STYLES).nullable().optional().describe("Dialogues : guillemets « », none (sans guillemets ni tirets), dashes (tiret cadratin), english “ ”. null = hériter."),
  forbidden_words: z
    .array(input({ word: z.string().min(1).max(80), use: z.string().max(80).optional() }))
    .max(100)
    .optional()
    .describe("Mots à ne jamais écrire, avec le remplaçant : [{ word: \"Maman\", use: \"Mama\" }]."),
};

const imageSource = {
  upload_id: z.string().max(40).optional().describe("Fichier déjà envoyé (create_upload, kind image ou cible identique). Le plus simple pour un fichier local."),
  image_base64: z.string().optional().describe("Ou l'image en base64 (petites images seulement)."),
  image_url: z.string().optional().describe("Ou une adresse https publique de l'image."),
  file_name: z.string().max(200).optional(),
};

async function sourceBuffer(args: { image_base64?: string; image_url?: string }): Promise<Buffer> {
  if (args.image_base64) return decodeBase64(args.image_base64);
  if (args.image_url) return fetchImage(args.image_url);
  throw badRequest("Fournir upload_id (fichier envoyé par create_upload), image_base64 ou image_url.");
}

function webImage(assetId: string, size: "thumb" | "web" = "web"): Content {
  const { file } = assetFilePath(getAsset(assetId), size);
  return { type: "image", data: fs.readFileSync(file).toString("base64"), mimeType: "image/webp" };
}

function ownerOf(args: { book_id?: string; series_id?: string }): Owner {
  if (args.book_id && args.series_id) throw badRequest("book_id ou series_id, pas les deux.");
  if (args.book_id) return { bookId: args.book_id };
  if (args.series_id) return { seriesId: args.series_id };
  throw badRequest("book_id ou series_id est requis.");
}

/** Optional book_id on character tools: when given, the character must be one the book uses. */
function checkCharacter(characterIdValue: string, book?: string): void {
  if (book) characterOfBook(book, characterIdValue);
  else characterRow(characterIdValue);
}

function characterReply(c: Character, changed: string[], extra: Record<string, unknown> = {}, full = false) {
  if (full) return { ...presentCharacter(c, true), changed, ...extra };
  return { id: c.id, name: c.name, imageCount: c.images.length, changed, ...extra };
}

const MAX_INLINE_IMAGES = 12;

export function buildMcpServer(actor: Actor, origin: string): McpServer {
  const server = new McpServer({ name: "la-fabrique", version: "0.2.0" }, { instructions: agentInstructions(origin) });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  // --- reading ---------------------------------------------------------------------------

  server.registerTool(
    "whoami",
    { title: "Qui suis-je", description: "Nom (qui signe tes modifications) et portée de ta connexion.", inputSchema: input({}), annotations: readOnly },
    () => run(() => ({ name: actor.name, type: actor.type, scope: actor.scope })),
  );

  server.registerTool(
    "list_books",
    {
      title: "Lister les livres",
      description: "Livres de la bibliothèque, du plus récemment modifié au plus ancien.",
      inputSchema: input({
        filter: z.enum(["all", "active", "done", "archived"]).optional().describe("Défaut : all (hors archivés)."),
        query: z.string().max(100).optional().describe("Recherche dans le titre."),
      }),
      annotations: readOnly,
    },
    ({ filter, query }) =>
      run(() =>
        listBooks(filter ?? "all", query ?? "").map((b) => ({
          id: b.id,
          title: b.title,
          status: b.status,
          format: b.format,
          spreadCount: b.spreadCount,
          completeSpreads: b.completeSpreads,
          openRequests: b.openRequests,
          updatedAt: b.updatedAt,
        })),
      ),
  );

  server.registerTool(
    "get_book",
    {
      title: "Lire un livre",
      description:
        "Le livre : métadonnées, brief, règles d'écriture effectives (writing_guide), typographie, doubles pages, personnages. À lire avant toute modification. summary=true : doubles pages résumées (extrait, statut de l'illustration). include : sections à renvoyer.",
      inputSchema: input({
        book_id: bookId,
        include: z.array(z.enum(BOOK_SECTIONS)).optional().describe(`Sections : ${BOOK_SECTIONS.join(", ")}. Défaut : toutes.`),
        summary: z.boolean().optional().describe("Doubles pages en résumé (id, extrait, mots, illustration ok/low_resolution/none, dpi)."),
      }),
      annotations: readOnly,
    },
    ({ book_id, include, summary }) => run(() => presentBook(getBook(book_id), { include, summary })),
  );

  server.registerTool(
    "get_spread",
    {
      title: "Lire une double page",
      description: "Une double page complète et sa version courante (à passer en base_version).",
      inputSchema: input({ book_id: bookId, spread_id: spreadId }),
      annotations: readOnly,
    },
    ({ book_id, spread_id }) => run(() => presentSpread(getSpread(book_id, spread_id), getFormat(getBook(book_id).format))),
  );

  server.registerTool(
    "view_illustration",
    {
      title: "Voir une image",
      description: "Affiche une image : l'illustration d'une double page (spread_id), la couverture, ou une image de référence d'un personnage (image_id).",
      inputSchema: input({
        target: z.enum(["spread", "cover", "character_image"]).optional().describe("Déduit des autres paramètres si absent."),
        book_id: bookId.optional(),
        spread_id: spreadId.optional(),
        image_id: id("Image de référence (list_characters → images[].id).").optional(),
        size: z.enum(["thumb", "web"]).optional().describe("thumb (480 px) ou web (1800 px, défaut)."),
      }),
      annotations: readOnly,
    },
    (args) =>
      runContent(() => {
        const target = args.target ?? (args.image_id ? "character_image" : args.spread_id ? "spread" : "cover");
        let assetId: string | undefined;
        if (target === "character_image") {
          if (!args.image_id) throw badRequest("image_id est requis pour une image de référence.");
          assetId = characterImageAsset(args.image_id);
        } else {
          if (!args.book_id) throw badRequest("book_id est requis.");
          if (target === "spread") {
            if (!args.spread_id) throw badRequest("spread_id est requis.");
            assetId = getSpread(args.book_id, args.spread_id).illustration?.id;
          } else assetId = getBook(args.book_id).cover?.id;
        }
        if (!assetId) return [text("Pas d'image ici.")];
        return [webImage(assetId, args.size ?? "web")];
      }),
  );

  server.registerTool(
    "view_book_contact_sheet",
    {
      title: "Planche contact du livre",
      description:
        "Tout le livre sur une image : couverture puis chaque double page (illustration | début du texte), numéros, dpi trop faibles et personnages présents. Pour vérifier qu'aucune image n'est mal placée.",
      inputSchema: input({ book_id: bookId, size: z.enum(["small", "large"]).optional().describe("Défaut : small.") }),
      annotations: readOnly,
    },
    ({ book_id, size }) =>
      runContent(async () => {
        const sheet = await contactSheet(book_id, size ?? "small");
        return [{ type: "image", data: sheet.image.toString("base64"), mimeType: sheet.mimeType }, text({ legend: sheet.legend })];
      }),
  );

  server.registerTool(
    "list_characters",
    {
      title: "Personnages",
      description:
        "Fiches des personnages d'un livre (ceux de sa série d'abord, shared) ou d'une série : nom, rôle, apparence, images de référence (id, label, view, primary).",
      inputSchema: input({ book_id: bookId.optional(), series_id: seriesId.optional() }),
      annotations: readOnly,
    },
    (args) =>
      run(() => {
        const owner = ownerOf(args);
        return (owner.bookId ? listCharacters(owner.bookId) : listOwnerCharacters(owner)).map((c) => presentCharacter(c, true));
      }),
  );

  server.registerTool(
    "get_references",
    {
      title: "Références pour illustrer",
      description:
        "À appeler AVANT de produire une illustration : style d'illustration de la série et du livre, personnages présents sur la double page (ou ceux demandés, ou tous), apparence, images classées par vue (by_view) — affichées ici et en liens signed_url téléchargeables sans clé pendant 24 h, à transmettre au générateur d'images.",
      inputSchema: input({
        book_id: bookId.optional(),
        series_id: seriesId.optional(),
        spread_id: spreadId.optional().describe("Double page à illustrer : seuls ses personnages."),
        character_ids: z.array(z.string().max(40)).max(50).optional(),
        views: z.array(z.string().max(60)).max(20).optional().describe(`Ne garder que ces vues (${IMAGE_VIEWS.join(", ")}, expression).`),
        images: z.enum(["primary", "all", "none"]).optional().describe("Images affichées ici. Défaut : primary (la principale de chaque personnage)."),
      }),
      annotations: readOnly,
    },
    (args) =>
      runContent(() => {
        const refs = characterReferences(ownerOf(args), { origin, spreadId: args.spread_id, characterIds: args.character_ids, views: args.views });
        const mode = args.images ?? "primary";
        const shown = mode === "none" ? [] : refs.characters.flatMap((c) => c.images.filter((i) => mode === "all" || i.primary).map((i) => ({ c, i })));
        const content: Content[] = [text(refs)];
        for (const { c, i } of shown.slice(0, MAX_INLINE_IMAGES)) {
          content.push({ type: "text", text: `${c.name} — ${i.view}${i.label ? ` (${i.label})` : ""}${i.primary ? ", principale" : ""}` });
          content.push(webImage(characterImageAsset(i.id)));
        }
        return content;
      }),
  );

  server.registerTool(
    "list_series",
    { title: "Séries", description: "Séries (univers partagés par plusieurs livres) : id, titre, nombre de personnages et de livres.", inputSchema: input({}), annotations: readOnly },
    () => run(() => listSeries()),
  );

  server.registerTool(
    "get_series",
    {
      title: "Lire une série",
      description: "Une série : description, style d'illustration, règles d'écriture, valeurs par défaut des nouveaux livres, personnages partagés, livres.",
      inputSchema: input({ series_id: seriesId }),
      annotations: readOnly,
    },
    ({ series_id }) =>
      run(() => {
        const s = getSeries(series_id);
        return { ...s, characters: s.characters.map((c) => presentCharacter(c)) };
      }),
  );

  server.registerTool(
    "check_text",
    {
      title: "Vérifier le texte",
      description:
        "Applique les règles d'écriture du livre et de sa série à chaque page : mots interdits, guillemets ou tirets, typographie, Markdown, longueur. Ne renvoie que les pages concernées.",
      inputSchema: input({
        book_id: bookId,
        spread_id: spreadId.optional(),
        min_severity: z.enum(["error", "warning", "info"]).optional().describe("Défaut : info (tout)."),
      }),
      annotations: readOnly,
    },
    ({ book_id, spread_id, min_severity }) => run(() => checkText(book_id, { spreadId: spread_id, minSeverity: min_severity })),
  );

  server.registerTool(
    "list_shares",
    {
      title: "Liens de lecture",
      description:
        "Avec qui le livre est partagé en lecture seule (lien sans compte) : pour qui, expiration, nombre de lectures. Les liens eux-mêmes et leur création restent à Guillaume (bouton Partager de l'éditeur).",
      inputSchema: input({ book_id: bookId }),
      annotations: readOnly,
    },
    ({ book_id }) => run(() => listShares(book_id, null)),
  );

  server.registerTool(
    "list_requests",
    {
      title: "Demandes ouvertes",
      description: "Demandes de Guillaume qui te sont adressées et pas encore résolues, avec leurs réponses. À traiter en priorité.",
      inputSchema: input({ book_id: bookId.optional().describe("Limiter à un livre.") }),
      annotations: readOnly,
    },
    ({ book_id }) => run(() => listOpenRequests("agent", book_id)),
  );

  server.registerTool(
    "list_comments",
    {
      title: "Lire les échanges",
      description: "Fils de discussion d'un livre (ou d'une double page).",
      inputSchema: input({ book_id: bookId, spread_id: spreadId.optional(), open_only: z.boolean().optional() }),
      annotations: readOnly,
    },
    ({ book_id, spread_id, open_only }) => run(() => listComments(book_id, { spreadId: spread_id, openOnly: open_only })),
  );

  server.registerTool(
    "list_activity",
    {
      title: "Historique",
      description:
        "Qui a modifié quoi, quand, avec le détail des images (details : cible, fichier, dimensions, dpi). Les entrées restaurables portent restorable=true (restore_version).",
      inputSchema: input({
        book_id: bookId.optional(),
        series_id: seriesId.optional(),
        spread_id: spreadId.optional(),
        character_id: characterId.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: readOnly,
    },
    (args) => run(() => listActivity(ownerOf(args), { spreadId: args.spread_id, characterId: args.character_id, limit: args.limit ?? 50 })),
  );

  server.registerTool(
    "list_fonts",
    { title: "Polices disponibles", description: "Clés utilisables dans la typographie (catalogue et polices perso).", inputSchema: input({}), annotations: readOnly },
    () => run(() => ({ catalog: FONT_CATALOG.map((f) => ({ key: f.key, family: f.family, category: f.category, note: f.note })), custom: listCustomFonts().map((f) => ({ key: f.key, name: f.name })) })),
  );

  server.registerTool(
    "list_formats",
    { title: "Formats et statuts", description: "Formats de livre, statuts, pixels requis pour l'impression, vues d'images et styles de guillemets.", inputSchema: input({}), annotations: readOnly },
    () =>
      run(() => ({
        formats: BOOK_FORMATS.map((f) => ({ ...f, printPixels: requiredPixels(f) })),
        statuses: BOOK_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
        imageViews: [...IMAGE_VIEWS, "expression:<nom>"],
        quoteStyles: QUOTE_STYLES,
        uploadKinds: UPLOAD_KINDS,
      })),
  );

  if (!canWrite(actor)) return server;

  // --- writing ---------------------------------------------------------------------------

  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  const uploadItem = {
    kind: z.enum(UPLOAD_KINDS).optional(),
    target_id: z.string().max(40).optional().describe("Double page (spread_illustration) ou personnage (character_image)."),
    filename: z.string().min(1).max(200).describe("Nom du fichier local, tel que passé à curl -T."),
    content_type: z.string().max(100).optional().describe("image/png, image/jpeg…"),
    label: z.string().max(80).optional().describe("Image de personnage : ce qu'elle montre (« face », « profil droit », « dos », « visage »…)."),
    view: z.string().max(60).optional().describe(viewDescription),
    primary: z.boolean().optional(),
  };

  server.registerTool(
    "create_upload",
    {
      title: "Préparer un envoi de fichier",
      description:
        "Pour déposer un fichier LOCAL (illustration, couverture, image de personnage) sans base64 : renvoie une URL signée à usage unique (15 min, sans clé) et la commande curl à lancer (`curl -T fichier URL`), puis commit_upload. kind : spread_illustration (target_id = double page), cover, character_image (target_id = personnage), image (libre, pour create_character ou un outil avec upload_id). files[] : plusieurs fichiers en un appel.",
      inputSchema: input({
        book_id: bookId.optional().describe("Requis pour cover et image ; déduit de target_id sinon."),
        series_id: seriesId.optional().describe("Image libre pour un personnage de série."),
        ...uploadItem,
        filename: uploadItem.filename.optional(),
        auto_commit: z.boolean().optional().describe("Attacher dès réception (pas de commit_upload)."),
        files: z
          .array(input({ ...uploadItem }))
          .min(1)
          .max(50)
          .optional()
          .describe("Plusieurs fichiers ; chacun hérite de kind, target_id… donnés au niveau supérieur."),
      }),
      annotations: write,
    },
    (args) => run(() => createUploads(createUploadsSchema.parse(service(args)), actor, origin)),
  );

  server.registerTool(
    "commit_upload",
    {
      title: "Attacher des fichiers envoyés",
      description:
        "Attache les fichiers reçus à leur cible (double page, couverture, personnage) et renvoie pour chacun : asset, dimensions, dpi à l'impression, avertissements (lowResolution, aspectRatio). Une petite image est gardée, jamais refusée. Rejouer un commit renvoie le même résultat.",
      inputSchema: input({
        upload_id: z.string().max(40).optional(),
        upload_ids: z.array(z.string().max(40)).min(1).max(50).optional(),
      }),
      annotations: write,
    },
    ({ upload_id, upload_ids }) =>
      run(() => {
        const ids = [...(upload_ids ?? []), ...(upload_id ? [upload_id] : [])];
        if (ids.length === 0) throw badRequest("upload_id ou upload_ids est requis.");
        return commitUploads(ids);
      }),
  );

  const bookFields = {
    title: z.string().min(1).max(160).optional(),
    subtitle: z.string().max(200).optional(),
    author: z.string().max(160).optional(),
    illustrator: z.string().max(160).optional(),
    language: z.string().min(2).max(8).optional().describe("fr, en…"),
    age_min: age.optional(),
    age_max: age.optional(),
    format: z.enum(BOOK_FORMATS.map((f) => f.key) as [string, ...string[]]).optional(),
    brief: z.string().max(20_000).optional().describe("Brief du livre : histoire, ton, personnages, intentions."),
    words_per_spread: z.number().int().min(1).max(1000).nullable().optional(),
    typography: typographyInput.optional(),
    ...rulesInput,
  };

  server.registerTool(
    "create_book",
    {
      title: "Créer un livre",
      description:
        "Crée un livre (statut « Idée ») avec spread_count doubles pages vides (12 par défaut, 0 possible). Avec series_id : le livre partage les personnages de la série (liés, pas copiés), son style et ses règles, et reprend son format, sa typographie, sa langue et ses âges.",
      inputSchema: input({
        ...bookFields,
        title: z.string().min(1).max(160),
        spread_count: z.number().int().min(0).max(40).optional(),
        series_id: seriesId.optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const book = createBook(createBookSchema.parse(service(args)), actor);
        if (args.verbose) return presentBook(book);
        return {
          id: book.id,
          title: book.title,
          series: book.series,
          format: book.format,
          printPixels: requiredPixels(getFormat(book.format)),
          spreadIds: book.spreads.map((s) => s.id),
          characters: book.characters.map((c) => ({ id: c.id, name: c.name })),
        };
      }),
  );

  server.registerTool(
    "clone_book_setup",
    {
      title: "Nouveau livre sur le modèle d'un autre",
      description:
        "Crée un livre avec la mise en place d'un autre : série, format, typographie, langue, âges, style, règles, et copie de ses personnages propres avec leurs images. Aucune page n'est copiée (spread_count pages vides).",
      inputSchema: input({
        from_book_id: bookId,
        title: z.string().min(1).max(160),
        subtitle: z.string().max(200).optional(),
        spread_count: z.number().int().min(0).max(40).optional(),
        include_brief: z.boolean().optional().describe("Copier aussi le brief (non par défaut : nouvelle histoire)."),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const { book, copiedCharacters } = cloneBookSetup(args.from_book_id, cloneBookSchema.parse(service(args, "from_book_id")), actor);
        if (args.verbose) return { ...presentBook(book), copiedCharacters };
        return { id: book.id, title: book.title, series: book.series, copiedCharacters, spreadIds: book.spreads.map((s) => s.id) };
      }),
  );

  server.registerTool(
    "update_book",
    {
      title: "Modifier un livre",
      description:
        "Métadonnées, brief, statut, format, typographie, style d'illustration et règles d'écriture du livre (ajoutés à ceux de la série), série (series_id, null pour quitter), archivage. Seuls les champs fournis changent. Réponse : id, version, changed.",
      inputSchema: input({
        book_id: bookId,
        ...bookFields,
        status: z.enum(BOOK_STATUSES).optional(),
        series_id: seriesId.nullable().optional(),
        archived: z.boolean().optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const { book, changed } = updateBookWithChanges(args.book_id, updateBookSchema.parse(service(args, "book_id")), actor);
        return args.verbose ? { ...presentBook(book), changed: changed.map(toSnake) } : { id: book.id, version: book.version, changed: changed.map(toSnake) };
      }),
  );

  const seriesFields = {
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(20_000).optional().describe("L'univers : lieux, situation, ce qui ne change pas d'un livre à l'autre."),
    ...rulesInput,
    language: z.string().min(2).max(8).optional(),
    age_min: age.optional(),
    age_max: age.optional(),
    format: z.enum(BOOK_FORMATS.map((f) => f.key) as [string, ...string[]]).nullable().optional().describe("Format des nouveaux livres."),
    typography: typographyInput.nullable().optional().describe("Typographie des nouveaux livres."),
    words_per_spread: z.number().int().min(1).max(1000).nullable().optional(),
  };

  server.registerTool(
    "create_series",
    {
      title: "Créer une série",
      description:
        "Une série = un univers partagé par plusieurs livres : personnages avec leurs références, style d'illustration, règles d'écriture, format et typographie par défaut. from_book_id : ce livre devient le modèle de la série (ses personnages, son style et ses règles montent dans la série ; il en fait partie).",
      inputSchema: input({ ...seriesFields, title: z.string().min(1).max(160), from_book_id: bookId.optional(), verbose }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const { series, movedCharacters } = createSeries(createSeriesSchema.parse(service(args)), actor);
        if (args.verbose) return { ...series, characters: series.characters.map((c) => presentCharacter(c)), movedCharacters };
        return { id: series.id, title: series.title, movedCharacters, characters: series.characters.map((c) => ({ id: c.id, name: c.name })), books: series.books };
      }),
  );

  server.registerTool(
    "update_series",
    {
      title: "Modifier une série",
      description: "Titre, description, style d'illustration, règles d'écriture, valeurs par défaut des nouveaux livres, archivage. S'applique à tous les livres de la série. Réponse : id, version, changed.",
      inputSchema: input({ series_id: seriesId, ...seriesFields, archived: z.boolean().optional(), verbose }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const { series, changed } = updateSeries(args.series_id, updateSeriesSchema.parse(service(args, "series_id")), actor);
        const fields = changed.map(toSnake);
        return args.verbose ? { ...series, characters: series.characters.map((c) => presentCharacter(c)), changed: fields } : { id: series.id, version: series.version, changed: fields };
      }),
  );

  server.registerTool(
    "add_spread",
    {
      title: "Ajouter une double page",
      description: "Insère une double page (à la fin par défaut, ou à position, 0 = première ; les suivantes sont renumérotées).",
      inputSchema: input({
        book_id: bookId,
        position: z.number().int().min(0).optional(),
        text: z.string().max(10_000).optional(),
        illustration_brief: z.string().max(5_000).optional(),
        notes: z.string().max(5_000).optional(),
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const s = addSpread(args.book_id, createSpreadSchema.parse(service(args, "book_id")), actor);
        return { id: s.id, position: s.position, version: s.version, spreadCount: getBook(args.book_id).spreads.length };
      }),
  );

  server.registerTool(
    "update_spread",
    {
      title: "Modifier une double page",
      description:
        "Texte (page de droite, texte brut, ligne vide = paragraphe), brief d'illustration, notes, cadrage, personnages présents, ajustements de mise en page (null = valeur du livre). Passer base_version (version lue) pour ne pas écraser une saisie de Guillaume. Réponse : id, version, changed.",
      inputSchema: input({
        book_id: bookId,
        spread_id: spreadId,
        text: z.string().max(10_000).optional(),
        illustration_brief: z.string().max(5_000).optional(),
        illustration_fit: z.enum(ILLUSTRATION_FITS).optional().describe("cover (remplir, recadre) ou contain (entière)."),
        notes: z.string().max(5_000).optional(),
        text_align: z.enum(TEXT_ALIGNS).nullable().optional(),
        text_valign: z.enum(TEXT_VALIGNS).nullable().optional(),
        text_size_pt: z.number().min(6).max(96).nullable().optional(),
        page_color: z.string().nullable().optional().describe("#RRGGBB"),
        character_ids: z.array(z.string().max(40)).max(50).optional().describe("Personnages présents (ids de list_characters)."),
        base_version: z.number().int().optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const before = getSpread(args.book_id, args.spread_id);
        const after = updateSpread(args.book_id, args.spread_id, updateSpreadSchema.parse(service(args, "book_id", "spread_id")), actor);
        const changed = after.version === before.version ? [] : Object.keys(args).filter((k) => !["book_id", "spread_id", "base_version", "verbose"].includes(k));
        if (args.verbose) return { ...presentSpread(after, getFormat(getBook(args.book_id).format)), changed };
        return { id: after.id, version: after.version, wordCount: after.wordCount, changed };
      }),
  );

  server.registerTool(
    "delete_spread",
    {
      title: "Supprimer une double page",
      description: "Supprime une double page (restaurable depuis l'historique). Les suivantes sont renumérotées : la réponse donne le nouvel ordre.",
      inputSchema: input({ book_id: bookId, spread_id: spreadId }),
      annotations: { ...write, destructiveHint: true },
    },
    ({ book_id, spread_id }) =>
      run(() => {
        deleteSpread(book_id, spread_id, actor);
        return { deleted: spread_id, order: getBook(book_id).spreads.map((s) => s.id) };
      }),
  );

  server.registerTool(
    "reorder_spreads",
    {
      title: "Réordonner les doubles pages",
      description: "Nouvel ordre complet : chaque spread_id du livre une fois.",
      inputSchema: input({ book_id: bookId, order: z.array(z.string().max(40)).max(200) }),
      annotations: write,
    },
    ({ book_id, order }) => run(() => ({ order: reorderSpreads(book_id, order, actor).spreads.map((s) => s.id) })),
  );

  server.registerTool(
    "set_illustration",
    {
      title: "Déposer l'illustration",
      description:
        "Pose l'image de la page de gauche. Fichier local : create_upload (kind spread_illustration, auto_commit) suffit, ou passer ici son upload_id. Sinon image_url (https publique) ou image_base64 (petite image). Réponse : dimensions, dpi, avertissements.",
      inputSchema: input({ book_id: bookId, spread_id: spreadId, ...imageSource }),
      annotations: write,
    },
    (args) =>
      run(async () => {
        if (args.upload_id) return setIllustrationFromUpload(args.book_id, args.spread_id, args.upload_id, actor);
        getSpread(args.book_id, args.spread_id);
        const asset = await storeImage(await sourceBuffer(args), { kind: "illustration", bookId: args.book_id, originalName: args.file_name, actor });
        setIllustration(args.book_id, args.spread_id, asset, actor);
        return { status: "attached", ...imageReport("spread_illustration", args.book_id, asset), targetId: args.spread_id };
      }),
  );

  server.registerTool(
    "remove_illustration",
    {
      title: "Retirer l'illustration",
      description: "Retire l'image d'une double page (restaurable).",
      inputSchema: input({ book_id: bookId, spread_id: spreadId }),
      annotations: write,
    },
    ({ book_id, spread_id }) => run(() => ({ id: spread_id, version: setIllustration(book_id, spread_id, null, actor).version, illustration: null })),
  );

  server.registerTool(
    "set_cover",
    {
      title: "Déposer la couverture",
      description: "Image de couverture : upload_id (fichier local envoyé par create_upload), image_url ou image_base64. Réponse : dimensions, dpi, avertissements.",
      inputSchema: input({ book_id: bookId, ...imageSource }),
      annotations: write,
    },
    (args) =>
      run(async () => {
        if (args.upload_id) return setCoverFromUpload(args.book_id, args.upload_id, actor);
        getBook(args.book_id);
        const asset = await storeImage(await sourceBuffer(args), { kind: "cover", bookId: args.book_id, originalName: args.file_name, actor });
        setCover(args.book_id, asset, actor);
        return { status: "attached", ...imageReport("cover", args.book_id, asset) };
      }),
  );

  server.registerTool(
    "remove_cover",
    { title: "Retirer la couverture", description: "Retire la couverture (restaurable).", inputSchema: input({ book_id: bookId }), annotations: write },
    ({ book_id }) => run(() => ({ id: book_id, version: setCover(book_id, null, actor).version, cover: null })),
  );

  const characterImageInput = input({
    upload_id: z.string().max(40).describe("Fichier envoyé par create_upload (kind image)."),
    label: z.string().max(80).optional(),
    view: z.string().max(60).optional().describe(viewDescription),
    primary: z.boolean().optional(),
  });

  server.registerTool(
    "create_character",
    {
      title: "Créer un personnage",
      description:
        "Nouvelle fiche dans un livre (book_id) ou une série (series_id, partagée par ses livres) : nom, rôle, apparence en mots, position, images de référence déjà envoyées (images[] d'upload_id), ou copie d'une fiche existante avec ses images (source_character_id). Réponse : id, image_ids.",
      inputSchema: input({
        book_id: bookId.optional(),
        series_id: seriesId.optional(),
        name: z.string().min(1).max(80).optional().describe("Requis sauf copie (source_character_id)."),
        role: z.string().max(500).optional(),
        appearance: z.string().max(5_000).optional().describe("Couleurs, vêtements, signes distinctifs."),
        position: z.number().int().min(0).optional(),
        source_character_id: characterId.optional(),
        images: z.array(characterImageInput).max(30).optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const c = createCharacterWithUploads(ownerOf(args), createCharacterSchema.parse(service(args, "book_id", "series_id")), actor);
        if (args.verbose) return presentCharacter(c, true);
        return { id: c.id, name: c.name, shared: c.seriesId !== null, imageCount: c.images.length, imageIds: c.images.map((i) => i.id) };
      }),
  );

  server.registerTool(
    "update_character",
    {
      title: "Modifier un personnage",
      description: "Nom, rôle, apparence ou place (position). Seuls les champs fournis changent. Un personnage de série change dans tous ses livres. Réponse : id, image_count, changed.",
      inputSchema: input({
        character_id: characterId,
        book_id: bookId.optional().describe("Facultatif : vérifie que le livre utilise ce personnage."),
        name: z.string().min(1).max(80).optional(),
        role: z.string().max(500).optional(),
        appearance: z.string().max(5_000).optional(),
        position: z.number().int().min(0).optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        checkCharacter(args.character_id, args.book_id);
        const { character, changed } = updateCharacter(args.character_id, updateCharacterSchema.parse(service(args, "character_id", "book_id")), actor);
        return characterReply(character, changed, {}, args.verbose);
      }),
  );

  server.registerTool(
    "reorder_characters",
    {
      title: "Réordonner les personnages",
      description: "Nouvel ordre des fiches d'un livre ou d'une série (ordered_ids ; ceux non cités gardent leur ordre après). Dans un livre, ceux de la série restent avant les siens.",
      inputSchema: input({ book_id: bookId.optional(), series_id: seriesId.optional(), ordered_ids: z.array(z.string().max(40)).min(1).max(200) }),
      annotations: write,
    },
    (args) => run(() => ({ order: reorderCharacters(ownerOf(args), args.ordered_ids, actor).map((c) => ({ id: c.id, name: c.name })) })),
  );

  server.registerTool(
    "delete_character",
    {
      title: "Supprimer un personnage",
      description: "Supprime la fiche et la retire des doubles pages (restaurable depuis l'historique).",
      inputSchema: input({ character_id: characterId, book_id: bookId.optional() }),
      annotations: { ...write, destructiveHint: true },
    },
    ({ character_id, book_id }) =>
      run(() => {
        checkCharacter(character_id, book_id);
        deleteCharacter(character_id, actor);
        return { deleted: character_id };
      }),
  );

  server.registerTool(
    "add_character_image",
    {
      title: "Ajouter une image de référence",
      description:
        "Image d'un personnage : upload_id (fichier local envoyé par create_upload), image_url ou image_base64. label = ce qu'elle montre (« face », « profil droit », « dos », « visage », « expression joyeuse »), view = vue normalisée (déduite du label sinon), primary = la référence à utiliser d'abord (la première l'est d'office). Réponse : id, image_id, image_count, avertissements.",
      inputSchema: input({
        character_id: characterId,
        book_id: bookId.optional(),
        ...imageSource,
        label: z.string().max(80).optional(),
        view: z.string().max(60).optional().describe(viewDescription),
        primary: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(async () => {
        checkCharacter(args.character_id, args.book_id);
        const fields = characterImageSchema.parse(service(args, "character_id", "book_id", "upload_id", "image_base64", "image_url", "file_name"));
        let report: Record<string, unknown>;
        let imageId: string;
        if (args.upload_id) {
          const r = addCharacterImageFromUpload(args.character_id, args.upload_id, fields, actor);
          imageId = r.imageId as string;
          report = { asset: r.asset, warnings: r.warnings };
        } else {
          const c = characterRow(args.character_id);
          const asset = await storeImage(await sourceBuffer(args), { kind: "character", bookId: c.book_id, originalName: args.file_name, actor });
          imageId = addCharacterImages(args.character_id, [{ asset, label: fields.label, view: fields.view, primary: fields.primary }], actor).imageIds[0] as string;
          const r = imageReport("character_image", c.book_id, asset, imageId);
          report = { asset: r.asset, warnings: r.warnings };
        }
        if (fields.position !== undefined) updateCharacterImage(args.character_id, imageId, { position: fields.position }, actor);
        return characterReply(getCharacter(args.character_id), ["images"], { imageId, ...report }, args.verbose);
      }),
  );

  server.registerTool(
    "update_character_image",
    {
      title: "Modifier une image de référence",
      description: "Étiquette (label), vue normalisée (view), image principale (primary) ou place dans la fiche (position, 0 = première). Réponse : id, image_count, changed.",
      inputSchema: input({
        character_id: characterId,
        image_id: id("Image de référence (list_characters → images[].id)."),
        book_id: bookId.optional(),
        label: z.string().max(80).optional(),
        view: z.string().max(60).optional().describe(viewDescription),
        primary: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
        verbose,
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        checkCharacter(args.character_id, args.book_id);
        const { character, changed } = updateCharacterImage(
          args.character_id,
          args.image_id,
          characterImageSchema.parse(service(args, "character_id", "image_id", "book_id")),
          actor,
        );
        return characterReply(character, changed, { imageId: args.image_id }, args.verbose);
      }),
  );

  server.registerTool(
    "remove_character_image",
    {
      title: "Retirer une image de référence",
      description: "Retire l'image de la fiche (restaurable). Réponse : id, image_count, changed.",
      inputSchema: input({ character_id: characterId, image_id: id("Image de référence."), book_id: bookId.optional(), verbose }),
      annotations: write,
    },
    (args) =>
      run(() => {
        checkCharacter(args.character_id, args.book_id);
        return characterReply(removeCharacterImage(args.character_id, args.image_id, actor), ["images"], {}, args.verbose);
      }),
  );

  server.registerTool(
    "post_comment",
    {
      title: "Écrire un message",
      description:
        "Message dans les échanges du livre. parent_id = répondre à un fil (ex. une demande traitée). addressed_to='human' pour une question ou une proposition à Guillaume. spread_id = sur une double page.",
      inputSchema: input({
        book_id: bookId,
        body: z.string().min(1).max(10_000),
        spread_id: spreadId.nullable().optional(),
        parent_id: z.string().max(40).optional(),
        addressed_to: z.enum(["human", "agent"]).nullable().optional(),
      }),
      annotations: write,
    },
    (args) =>
      run(() => {
        const c = createComment(args.book_id, createCommentSchema.parse(service(args, "book_id")), actor);
        return { id: c.id, parentId: c.parentId, addressedTo: c.addressedTo };
      }),
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Résoudre une demande",
      description: "Marque un fil comme résolu (ou le rouvre avec resolved=false).",
      inputSchema: input({ comment_id: z.string().max(40), resolved: z.boolean().optional() }),
      annotations: write,
    },
    ({ comment_id, resolved }) =>
      run(() => {
        const c = setCommentResolved(comment_id, resolved ?? true, actor);
        return { id: c.id, resolvedAt: c.resolvedAt };
      }),
  );

  server.registerTool(
    "restore_version",
    {
      title: "Restaurer une version",
      description:
        "Remet l'état d'avant une entrée d'historique (list_activity, restorable=true) : texte, illustration, couverture, fiche et images d'un personnage, réglages d'une série. La restauration est elle-même réversible.",
      inputSchema: input({ activity_id: z.string().max(40) }),
      annotations: write,
    },
    ({ activity_id }) =>
      run(() => {
        const { bookIds, seriesId: series } = restoreActivity(activity_id, actor);
        return { restored: activity_id, bookIds, seriesId: series };
      }),
  );

  return server;
}
