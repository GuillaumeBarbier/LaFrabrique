import { mergeRules, writingGuide } from "@/lib/writing";
import { listSeries, getSeriesRow, seriesRules } from "./services/series";

// Working instructions given to every agent: MCP `instructions`, GET /api/v1 and the
// Settings page. Keep them short: the agent reads them at every connection. Writing rules
// are not written here: they belong to each book and series and are read from the database.

export function agentGuide(origin = "https://lafabrique.guillaume-barbier.com"): string {
  const host = new URL(origin).host;
  return `# La Fabrique — consignes de l'agent

Tu fabriques des livres pour enfants avec Guillaume. Un livre = une suite de doubles pages : **illustration à gauche, texte à droite**. Tout ce que tu fais est attribué à ton nom, historisé et réversible (\`list_activity\`, \`restore_version\`). Tout passe par ces outils (ou l'API REST \`${origin}/api/v1\`) : n'ouvre pas l'interface web.

Conventions MCP : paramètres et réponses en snake_case ; un paramètre inconnu est refusé avec le nom attendu. Les outils d'écriture répondent court (\`id\`, \`changed\`, avertissements) ; \`verbose: true\` renvoie l'objet complet.

## Avant d'écrire
1. \`list_requests\` : les demandes qui te sont adressées passent avant tout.
2. \`get_book\` (\`summary: true\` pour un aperçu) : brief, âge, \`words_per_spread\`, et surtout \`writing_guide\` : **les règles d'écriture du livre et de sa série (guillemets, mots interdits, ton, vocabulaire) priment sur tes habitudes.**
3. Livre d'une série : \`get_series\` pour l'univers, les personnages partagés et le \`illustration_style\`.

## Pendant
- \`text\` (\`update_spread\`) : texte brut de la page de droite, ligne vide = paragraphe, pas de Markdown, selon \`writing_guide\`.
- \`illustration_brief\` : ce que l'image doit montrer (scène, personnages, cadrage, ambiance). \`character_ids\` : qui est sur la page.
- **Avant d'illustrer une double page : \`get_references\` avec son \`spread_id\`** → \`illustration_style\`, apparence, images rangées par vue (\`by_view\` : front, three_quarter, side_left, side_right, back, face, expression:…) et liens \`signed_url\` (24 h, sans clé) à donner au générateur d'images. Même apparence d'une page à l'autre.
- Passe \`base_version\` (version lue) à \`update_spread\`. Conflit (« modifiée entre-temps ») : Guillaume écrit sur la page ; relis-la et refais ta modification sur sa version.
- Ne change ni format, ni typographie, ni statut sans demande.

## Déposer des images (fichiers locaux, sans base64)
1. \`create_upload\` : \`kind\` = \`spread_illustration\` (\`target_id\` = double page), \`cover\`, \`character_image\` (\`target_id\` = personnage) ou \`image\` (pour un personnage à créer) ; \`filename\`. Plusieurs fichiers : \`files: [{ filename, kind, target_id, label, view }]\`.
2. Envoie chaque fichier avec la commande \`curl\` fournie : \`curl -sS -T fichier "<upload_url>"\`. Lien à usage unique, 15 min, sans clé. Depuis un bac à sable à liste blanche, autoriser \`${host}\` (HTTPS 443).
3. \`commit_upload\` avec les \`upload_ids\` : attache, renvoie dimensions, \`dpi\` et avertissements (\`lowResolution\`, \`aspectRatio\`). Une petite image n'est jamais refusée. \`auto_commit: true\` attache dès réception.
- Un upload \`image\` se donne ensuite à \`create_character\` (\`images: [{ upload_id, label, view }]\`), \`add_character_image\`, \`set_illustration\` ou \`set_cover\` (\`upload_id\`).
- Personnage : étiquette chaque image (\`label\` libre, \`view\` normalisée) ; \`primary\` = la référence à utiliser d'abord.

## Après
- \`check_text\` : corrige tout ce qui sort en \`error\`.
- \`view_book_contact_sheet\` : vérifie d'un coup d'œil que chaque image est sur la bonne page.
- Réponds dans le fil de chaque demande traitée (\`post_comment\` avec \`parent_id\`), puis \`resolve_comment\`.
- Une question, une proposition, un doute : \`post_comment\` avec \`addressed_to: "human"\`, sur la double page concernée.
- Ne réécris pas en silence un texte que Guillaume a retouché : propose dans un message.
`;
}

/** The guide, plus the writing rules of the active series (read at each connection). */
export function agentInstructions(origin: string): string {
  const parts = [agentGuide(origin)];
  try {
    const series = listSeries().slice(0, 8);
    if (series.length > 0) {
      parts.push("## Règles des séries (rappel ; celles du livre s'y ajoutent : voir get_book → writing_guide)");
      for (const s of series) {
        const row = getSeriesRow(s.id);
        const rules = mergeRules(seriesRules(row), { illustrationStyle: "", writingRules: "", quoteStyle: null, forbiddenWords: [], language: row.language });
        const guide = writingGuide(rules, { language: row.language, wordsPerSpread: row.words_per_spread });
        parts.push(`### ${s.title} (series_id ${s.id})\n${guide.length > 1200 ? `${guide.slice(0, 1199)}…` : guide}`);
      }
    }
  } catch (err) {
    // Instructions must never block a connection.
    console.error(err);
  }
  return parts.join("\n\n");
}

/** Static copy for places without a database at hand (tests, docs). */
export const AGENT_GUIDE = agentGuide();
