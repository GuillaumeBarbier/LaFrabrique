# API et MCP — mode d'emploi pour les agents

> Référence pour tout agent qui travaille **sur les livres** (pas sur le code). Décision : [ADR-0002](../decisions/0002-agents-par-cle-api-et-mcp.md). Les consignes de travail données à l'agent à chaque connexion sont dans [`src/server/agent-guide.ts`](../../src/server/agent-guide.ts) (champ `instructions` du MCP et `GET /api/v1`).

## 1. Obtenir une clé

Paramètres › Agents IA › « Créer une clé » : un **nom** (il signe chaque modification et chaque message de l'agent) et une **portée** :

| Portée | Peut |
|---|---|
| `read` | Tout lire : livres, doubles pages, images, échanges, historique, polices |
| `write` | Tout ce que fait `read`, plus écrire, illustrer, commenter, résoudre, restaurer, changer statut et typographie |

Jamais par clé, quelle que soit la portée : **supprimer un livre**, gérer les clés, téléverser ou supprimer une police perso, supprimer un message. La clé (`lfab_…`) n'est montrée qu'une fois ; elle est stockée hachée et révocable.

## 2. Se connecter

### Claude Code

```bash
claude mcp add --transport http lafabrique https://lafabrique.guillaume-barbier.com/api/mcp \
  --header "Authorization: Bearer lfab_…"
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "lafabrique": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://lafabrique.guillaume-barbier.com/api/mcp", "--header", "Authorization:${LAFABRIQUE_AUTH}"],
      "env": { "LAFABRIQUE_AUTH": "Bearer lfab_…" }
    }
  }
}
```

### claude.ai (web, mobile)

Pas encore : les connecteurs personnalisés de claude.ai n'envoient pas d'en-tête. Il faut un OAuth minimal (tâche F2.8).

### Tout autre agent : REST

`Authorization: Bearer lfab_…` sur `https://lafabrique.guillaume-barbier.com/api/v1/…`. `GET /api/v1` renvoie la liste des routes et les consignes.

## 3. Le modèle en bref

- **Livre** (`Book`) : titre, sous-titre, auteurs, langue, âge, **statut** (`idea` Idée, `writing` Écriture, `illustrating` Illustration, `review` Relecture, `done` Terminé), **format** (taille d'une page en mm), **brief** (mémoire du livre : histoire, ton, personnages, style), `wordsPerSpread` (cible), **typographie**, couverture, archivage.
- **Double page** (`Spread`) : `text` (page de droite, texte brut, ligne vide = paragraphe), `illustration` (page de gauche), `illustrationBrief` (ce que l'image doit montrer), `notes` (non imprimées), ajustements de mise en page (`null` = valeur du livre), `version`.
- **Échange** (`Comment`) : message sur le livre ou une double page ; une **demande** est un premier message adressé (`addressedTo`) à `agent` ou `human`, ouverte jusqu'à résolution ; les réponses ont un `parentId`.
- **Historique** (`ActivityEntry`) : qui, quoi, quand ; les modifications d'un même auteur sur une même cible sont regroupées sur 5 minutes ; `restorable: true` = on peut revenir à l'état d'avant.
- Types exacts : [`src/lib/types.ts`](../../src/lib/types.ts).

## 4. Outils MCP

| Outil | Portée | Rôle |
|---|---|---|
| `whoami` | read | Nom et portée de la clé |
| `list_books` | read | Bibliothèque (`filter` : all, active, done, archived) |
| `get_book` | read | Livre complet + `printPixels` (pixels requis pour imprimer à 300 dpi) |
| `get_spread` | read | Une double page |
| `view_illustration` | read | L'image d'une double page (ou la couverture), en image |
| `list_requests` | read | **Demandes ouvertes adressées à l'agent**, avec réponses |
| `list_comments` | read | Fils d'un livre ou d'une page |
| `list_activity` | read | Historique |
| `list_fonts`, `list_formats` | read | Polices utilisables, formats et statuts |
| `create_book` | write | Nouveau livre (12 doubles pages vides par défaut) |
| `update_book` | write | Métadonnées, brief, statut, format, typographie, archivage |
| `add_spread`, `update_spread`, `delete_spread`, `reorder_spreads` | write | Doubles pages |
| `set_illustration`, `remove_illustration`, `set_cover` | write | Images (base64 ou URL https publique) |
| `post_comment`, `resolve_comment` | write | Échanges |
| `restore_version` | write | Revenir à l'état d'avant une entrée d'historique |

Une clé `read` ne voit pas les outils d'écriture.

## 5. Routes REST

| Méthode | Route | Notes |
|---|---|---|
| GET | `/api/v1` | Index + consignes |
| GET | `/api/v1/me` | Qui appelle |
| GET | `/api/v1/formats` | Formats, statuts, langues |
| GET | `/api/v1/requests?to=agent\|human&bookId=` | Demandes ouvertes |
| GET, POST | `/api/v1/books` | `?filter=all\|active\|done\|archived&q=` |
| GET, PATCH | `/api/v1/books/{bookId}` | DELETE réservé à l'humain |
| PUT, DELETE | `/api/v1/books/{bookId}/cover` | Image : multipart `file`, `image/*` brut, ou JSON `{ base64 }` / `{ url }` |
| POST, PUT | `/api/v1/books/{bookId}/spreads` | POST ajoute (`position` facultatif) ; PUT `{ order: [ids] }` réordonne |
| GET, PATCH, DELETE | `/api/v1/books/{bookId}/spreads/{spreadId}` | PATCH accepte `baseVersion` |
| PUT, DELETE | `/api/v1/books/{bookId}/spreads/{spreadId}/illustration` | Comme la couverture |
| GET, POST | `/api/v1/books/{bookId}/comments` | `?spreadId=&open=1` |
| PATCH | `/api/v1/comments/{commentId}` | `{ resolved: boolean }` |
| GET | `/api/v1/books/{bookId}/activity` | `?spreadId=&limit=` |
| POST | `/api/v1/activity/{activityId}/restore` | |
| GET | `/api/v1/books/{bookId}/events` | Flux SSE `change` (qui a modifié quoi) |
| GET | `/api/v1/assets/{assetId}?size=original\|print\|web\|thumb` | Fichiers |
| GET | `/api/v1/fonts` | Catalogue + polices perso |

Erreurs : `{ "error": { "code", "message", "details" } }`, codes HTTP usuels. `409 conflict` = la double page a changé depuis `baseVersion` (`details.current` donne la version actuelle).

## 6. Bonnes pratiques (rappel des consignes)

1. Lire le brief et les demandes ouvertes avant d'écrire.
2. Texte brut, typographie de la langue du livre, longueur cible respectée.
3. Décrire l'image attendue dans `illustrationBrief`, même sans pouvoir la produire.
4. Passer `baseVersion` pour ne jamais écraser une saisie en cours de Guillaume ; sur 409, relire et refaire.
5. Répondre dans le fil de chaque demande traitée, puis la résoudre. Une question = un message adressé à l'humain.
6. Ne pas toucher au format, à la typographie ni au statut sans demande.

## 7. Images

Formats acceptés : JPEG, PNG, WebP, AVIF, GIF, TIFF (40 Mo au plus). SVG refusé (il pourrait porter du script). L'original est gardé pour l'impression ; La Fabrique produit une version écran (WebP 1800 px) et une vignette (480 px). Résolution d'impression : `printPixels` de `get_book` (ex. 2 434 × 2 434 px pour un carré de 20 cm, fonds perdus compris). Les URL fournies doivent être en https et publiques (pas d'adresse du réseau local).
