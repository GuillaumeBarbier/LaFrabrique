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

### claude.ai, Claude Desktop, mobile (OAuth, [ADR-0007](../decisions/0007-connecteur-oauth.md))

1. claude.ai › Paramètres › Connecteurs › **Ajouter un connecteur personnalisé** (aussi depuis Claude Desktop ; il apparaît ensuite sur le mobile).
2. Nom : `La Fabrique`. URL : `https://lafabrique.guillaume-barbier.com/api/mcp`. Rien d'autre (pas d'identifiant client à saisir).
3. « Se connecter » : La Fabrique ouvre sa page de connexion puis d'accord ; choisir le **nom de l'agent** (il signera son travail) et sa **portée**.

La connexion apparaît dans Paramètres › Agents IA › Connexions OAuth, révocable à tout moment.

### Claude Code sans clé (OAuth)

```bash
claude mcp add --transport http lafabrique https://lafabrique.guillaume-barbier.com/api/mcp
# puis, dans Claude Code : /mcp → lafabrique → s'authentifier (le navigateur s'ouvre)
```

### Tout autre agent : REST

`Authorization: Bearer lfab_…` sur `https://lafabrique.guillaume-barbier.com/api/v1/…`. `GET /api/v1` renvoie la liste des routes et les consignes.

## 3. Le modèle en bref

- **Livre** (`Book`) : titre, sous-titre, auteurs, langue, âge, **statut** (`idea` Idée, `writing` Écriture, `illustrating` Illustration, `review` Relecture, `done` Terminé), **format** (taille d'une page en mm), **brief** (mémoire du livre : histoire, ton, personnages, style), `wordsPerSpread` (cible), **typographie**, couverture, archivage.
- **Double page** (`Spread`) : `text` (page de droite, texte brut, ligne vide = paragraphe), `illustration` (page de gauche), `illustrationBrief` (ce que l'image doit montrer), `notes` (non imprimées), `characterIds` (personnages présents), ajustements de mise en page (`null` = valeur du livre), `version`.
- **Personnage** (`Character`, [ADR-0006](../decisions/0006-personnages-et-references.md)) : `name`, `role`, `appearance` (en mots), `images` de référence (`label` = ce que montre l'image, `primary` = celle à utiliser en premier). Inclus dans `get_book` (`characters`).
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
| `list_characters` | read | Fiches des personnages et leurs images de référence |
| `get_references` | read | **À appeler avant d'illustrer** : personnages présents sur une double page (ou demandés, ou tous), apparence, images affichées (`images` : primary, all, none) et liens `signedUrl` 24 h |
| `list_comments` | read | Fils d'un livre ou d'une page |
| `list_activity` | read | Historique |
| `list_fonts`, `list_formats` | read | Polices utilisables, formats et statuts |
| `create_book` | write | Nouveau livre (12 doubles pages vides par défaut) |
| `update_book` | write | Métadonnées, brief, statut, format, typographie, archivage |
| `add_spread`, `update_spread`, `delete_spread`, `reorder_spreads` | write | Doubles pages |
| `set_illustration`, `remove_illustration`, `set_cover` | write | Images (base64 ou URL https publique) |
| `create_character`, `update_character`, `delete_character` | write | Fiches des personnages |
| `add_character_image`, `update_character_image`, `remove_character_image` | write | Images de référence (base64 ou URL ; `label`, `primary`) |
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
| GET, POST | `/api/v1/books/{bookId}/characters` | Liste, création `{ name, role?, appearance? }` |
| GET, PATCH, DELETE | `/api/v1/books/{bookId}/characters/{characterId}` | PATCH : `name`, `role`, `appearance`, `position` |
| POST | `/api/v1/books/{bookId}/characters/{characterId}/images` | Multipart `file` + `label` + `primary`, ou JSON `{ base64 \| url, label?, primary? }` |
| PATCH, DELETE | `/api/v1/books/{bookId}/characters/{characterId}/images/{imageId}` | `{ label?, primary? }` |
| GET | `/api/v1/books/{bookId}/references` | `?spreadId=` ou `?characterIds=a,b` : références + liens 24 h |
| GET, POST | `/api/v1/books/{bookId}/comments` | `?spreadId=&open=1` |
| PATCH | `/api/v1/comments/{commentId}` | `{ resolved: boolean }` |
| GET | `/api/v1/books/{bookId}/activity` | `?spreadId=&characterId=&limit=` |
| POST | `/api/v1/activity/{activityId}/restore` | |
| GET | `/api/v1/books/{bookId}/events` | Flux SSE `change` (qui a modifié quoi) |
| GET | `/api/v1/assets/{assetId}?size=original\|print\|web\|thumb` | Fichiers (avec `&exp=&sig=` : lien temporaire, sans clé) |
| GET | `/api/v1/fonts` | Catalogue + polices perso |

Erreurs : `{ "error": { "code", "message", "details" } }`, codes HTTP usuels. `409 conflict` = la double page a changé depuis `baseVersion` (`details.current` donne la version actuelle).

## 6. Bonnes pratiques (rappel des consignes)

1. Lire le brief et les demandes ouvertes avant d'écrire.
2. Texte brut, typographie de la langue du livre, longueur cible respectée.
3. Décrire l'image attendue dans `illustrationBrief`, même sans pouvoir la produire. Indiquer les personnages présents (`characterIds`).
4. **Avant d'illustrer une double page : `get_references` avec son `spread_id`.** Respecter l'apparence et les images de référence ; transmettre les `signedUrl` au générateur d'images. Après avoir inventé un personnage, déposer sa planche (`add_character_image`).
5. Passer `baseVersion` pour ne jamais écraser une saisie en cours de Guillaume ; sur 409, relire et refaire.
6. Répondre dans le fil de chaque demande traitée, puis la résoudre. Une question = un message adressé à l'humain.
7. Ne pas toucher au format, à la typographie ni au statut sans demande.

## 7. Images

Formats acceptés : JPEG, PNG, WebP, AVIF, GIF, TIFF (40 Mo au plus). SVG refusé (il pourrait porter du script). L'original est gardé pour l'impression ; La Fabrique produit une version écran (WebP 1800 px) et une vignette (480 px). Résolution d'impression : `printPixels` de `get_book` (ex. 2 434 × 2 434 px pour un carré de 20 cm, fonds perdus compris). Les URL fournies doivent être en https et publiques (pas d'adresse du réseau local).

## 8. Personnages et références (pour l'agent qui illustre)

```bash
# Qui est sur la double page, à quoi ils ressemblent, et leurs images (liens valables 24 h sans clé)
curl -H "Authorization: Bearer lfab_…" "https://lafabrique.guillaume-barbier.com/api/v1/books/{bookId}/references?spreadId={spreadId}"
```

Réponse (extrait) :

```json
{
  "spreadId": "wpds20tmbdnf",
  "illustrationBrief": "Roux au bord de l'étang, les oies dans le ciel d'automne.",
  "expiresAt": "2026-10-04T10:00:00.000Z",
  "characters": [
    {
      "name": "Roux",
      "role": "Le héros, un renardeau de 6 ans",
      "appearance": "Pelage roux, ventre blanc, écharpe verte, grands yeux noirs.",
      "images": [
        { "label": "face", "primary": true, "signedUrl": "https://…/api/v1/assets/…?size=print&exp=…&sig=…", "signedWebUrl": "…" }
      ]
    }
  ]
}
```

Les images de référence acceptent les mêmes formats que les illustrations ; un fond transparent (PNG, WebP) est conservé. Les liens signés expirent : les redemander à chaque séance de travail.

## 9. OAuth (pour qui écrit un client)

| Élément | Valeur |
|---|---|
| Ressource protégée | `https://lafabrique.guillaume-barbier.com/api/mcp` |
| Métadonnées de la ressource | `/.well-known/oauth-protected-resource/api/mcp` (et sans le chemin) |
| Métadonnées du serveur | `/.well-known/oauth-authorization-server` |
| Autorisation | `/oauth/autoriser` (code + PKCE S256 obligatoire, `resource` facultatif mais vérifié) |
| Jetons | `POST /api/oauth/token` (formulaire) : `authorization_code`, `refresh_token` |
| Enregistrement | `POST /api/oauth/register` (RFC 7591, JSON) ; ou `client_id` = URL d'un document CIMD |
| Révocation | `POST /api/oauth/revoke` (RFC 7009) |
| Portées | `read`, `write` (choisie par l'humain à l'accord ; `offline_access` accepté et ignoré) |
| Durées | code 10 min, accès 1 h, rafraîchissement 60 jours à usage unique (rotation) |

Les jetons OAuth n'ouvrent que le serveur MCP. Pour l'API REST, utiliser une clé.
