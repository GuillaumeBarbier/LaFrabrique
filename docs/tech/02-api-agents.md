# API et MCP — mode d'emploi pour les agents

> Référence pour tout agent qui travaille **sur les livres** (pas sur le code). Décision : [ADR-0002](../decisions/0002-agents-par-cle-api-et-mcp.md). Les consignes de travail données à l'agent à chaque connexion sont dans [`src/server/agent-guide.ts`](../../src/server/agent-guide.ts) (champ `instructions` du MCP et `GET /api/v1`).

## 1. Obtenir une clé

Paramètres › Agents IA › « Créer une clé » : un **nom** (il signe chaque modification et chaque message de l'agent) et une **portée** :

| Portée | Peut |
|---|---|
| `read` | Tout lire : livres, doubles pages, images, échanges, historique, polices |
| `write` | Tout ce que fait `read`, plus écrire, illustrer, commenter, résoudre, restaurer, changer statut et typographie |

Jamais par clé, quelle que soit la portée : **supprimer un livre**, gérer les clés, créer ou révoquer un lien de lecture, téléverser ou supprimer une police perso, supprimer un message. La clé (`lfab_…`) n'est montrée qu'une fois ; elle est stockée hachée et révocable.

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

- **Série** (`Series`, [ADR-0008](../decisions/0008-agent-autonome-envois-series-regles.md)) : un univers partagé par plusieurs livres — personnages (liés, pas copiés), `illustrationStyle`, règles d'écriture, et valeurs par défaut des nouveaux livres (format, typographie, langue, âges, longueur).
- **Livre** (`Book`) : titre, sous-titre, auteurs, langue, âge, **statut** (`idea` Idée, `writing` Écriture, `illustrating` Illustration, `review` Relecture, `done` Terminé), **format** (taille d'une page en mm), **brief** (mémoire du livre : histoire, ton, intentions), `wordsPerSpread` (cible), **typographie**, couverture, archivage, `seriesId`. Style et règles propres au livre (`illustrationStyle`, `writingRules`, `quoteStyle`, `forbiddenWords`) **s'ajoutent** à ceux de la série : `effective` donne ce qui s'applique, `writingGuide` le même en texte.
- **Double page** (`Spread`) : `text` (page de droite, texte brut, ligne vide = paragraphe), `illustration` (page de gauche), `illustrationBrief` (ce que l'image doit montrer), `notes` (non imprimées), `characterIds` (personnages présents), ajustements de mise en page (`null` = valeur du livre), `version`. Numéro affiché = `position + 1` ; ajouter ou supprimer renumérote les suivantes.
- **Personnage** (`Character`, [ADR-0006](../decisions/0006-personnages-et-references.md)) : appartient à un livre ou à une série (`bookId` / `seriesId`) ; `name`, `role`, `appearance` (en mots), `images` de référence (`label` libre, `view` normalisée, `primary` = celle à utiliser en premier, `position`).
- **Vues** : `front` (face, en pied), `three_quarter`, `side_left`, `side_right`, `back`, `face` (visage, gros plan), `sheet` (planche), `expression:<nom>`, `other`. Déduites de l'étiquette si absentes (« profil droit » → `side_right`, « visage » → `face`, « dos » → `back`).
- **Envoi** (`Upload`) : un fichier local envoyé à une URL signée à usage unique, puis attaché (§ 10).
- **Échange** (`Comment`) : message sur le livre ou une double page ; une **demande** est un premier message adressé (`addressedTo`) à `agent` ou `human`, ouverte jusqu'à résolution ; les réponses ont un `parentId`.
- **Historique** (`ActivityEntry`) : qui, quoi, quand, `details` des images (cible, fichier, dimensions, dpi) ; les modifications de texte d'un même auteur sur une même cible sont regroupées sur 5 minutes, **chaque changement d'illustration ou de couverture a sa propre entrée** ; `restorable: true` = on peut revenir à l'état d'avant. L'historique d'un livre montre aussi les changements de sa série.
- Types exacts : [`src/lib/types.ts`](../../src/lib/types.ts).

## 4. Outils MCP

**Conventions** : paramètres et réponses en **snake_case** ; un paramètre inconnu est **refusé** avec le nom attendu (`ageMin (→ age_min)`) au lieu d'être ignoré. Les outils d'écriture répondent court (`id`, `version`, `changed`, avertissements) ; `verbose: true` renvoie l'objet complet.

| Outil | Portée | Rôle |
|---|---|---|
| `whoami` | read | Nom et portée de la connexion |
| `list_books` | read | Bibliothèque (`filter`, `query`) |
| `get_book` | read | Livre + `print_pixels`, `writing_guide`. `include` : brief, rules, typography, spreads, characters ; `summary: true` : pages résumées (extrait, illustration ok / low_resolution / none, dpi) |
| `get_spread` | read | Une double page complète |
| `view_illustration` | read | Une image : `target` spread, cover ou character_image (`image_id`), `size` thumb ou web |
| `view_book_contact_sheet` | read | **Tout le livre sur une image** (couverture, puis illustration \| début du texte de chaque page), légende avec dpi et personnages |
| `list_requests` | read | **Demandes ouvertes adressées à l'agent**, avec réponses |
| `list_characters` | read | Fiches d'un livre (série d'abord) ou d'une série, images (id, label, view, primary) |
| `get_references` | read | **À appeler avant d'illustrer** : `illustration_style`, personnages présents, images classées (`by_view`), affichées (`images` : primary, all, none) et liens `signed_url` 24 h ; filtre `views` |
| `list_series`, `get_series` | read | Séries |
| `check_text` | read | Règles d'écriture appliquées aux pages (`min_severity`) |
| `list_shares` | read | Avec qui le livre est partagé en lecture (étiquette, validité, lectures), sans les liens |
| `list_comments`, `list_activity` | read | Échanges ; historique (livre ou série) avec `details` |
| `list_fonts`, `list_formats` | read | Polices ; formats, statuts, vues, guillemets, kinds d'envoi |
| `create_upload`, `commit_upload` | write | **Envoi de fichiers locaux** (§ 10) |
| `create_book` | write | Nouveau livre : `spread_count` (0 à 40, 12 par défaut), `series_id`, règles |
| `clone_book_setup` | write | Nouveau livre sur le modèle d'un autre, sans ses pages (§ 11) |
| `update_book` | write | Métadonnées, brief, statut, format, typographie, style et règles, série, archivage |
| `create_series`, `update_series` | write | Séries (`from_book_id` : un livre modèle devient la série) |
| `add_spread`, `update_spread`, `delete_spread`, `reorder_spreads` | write | Doubles pages |
| `set_illustration`, `remove_illustration`, `set_cover`, `remove_cover` | write | Images : `upload_id`, `image_url` (https publique) ou `image_base64` (petites images) |
| `create_character` | write | Fiche dans un livre ou une série : `position`, `images: [{ upload_id, label, view, primary }]`, `source_character_id` (copie avec images) |
| `update_character`, `reorder_characters`, `delete_character` | write | Fiches |
| `add_character_image`, `update_character_image`, `remove_character_image` | write | Images de référence : `label`, `view`, `primary`, `position` |
| `post_comment`, `resolve_comment` | write | Échanges |
| `restore_version` | write | Revenir à l'état d'avant une entrée d'historique (texte, image, fiche, série) |

Une clé `read` ne voit pas les outils d'écriture. Les outils de personnage n'ont besoin que de `character_id` (`book_id` facultatif : vérifie que le livre l'utilise).

## 5. Routes REST

REST reste en **camelCase** (mêmes objets que l'interface).

| Méthode | Route | Notes |
|---|---|---|
| GET | `/api/v1` | Index + consignes |
| GET | `/api/v1/me` | Qui appelle |
| GET | `/api/v1/formats` | Formats, statuts, langues |
| GET | `/api/v1/requests?to=agent\|human&bookId=` | Demandes ouvertes |
| GET, POST | `/api/v1/books` | `?filter=all\|active\|done\|archived&q=` ; POST : `spreadCount`, `seriesId`, règles |
| GET, PATCH | `/api/v1/books/{bookId}` | `?summary=1&include=…` pour la vue légère ; DELETE réservé à l'humain |
| POST | `/api/v1/books/{bookId}/clone` | `{ title, spreadCount?, includeBrief? }` |
| GET | `/api/v1/books/{bookId}/check-text` | `?spreadId=&min=error\|warning\|info` |
| GET | `/api/v1/books/{bookId}/contact-sheet` | JPEG ; `?size=large` |
| PUT, DELETE | `/api/v1/books/{bookId}/cover` | JSON `{ uploadId }`, `{ base64 }` ou `{ url }`, multipart `file`, ou `image/*` brut |
| POST, PUT | `/api/v1/books/{bookId}/spreads` | POST ajoute (`position` facultatif) ; PUT `{ order: [ids] }` réordonne |
| GET, PATCH, DELETE | `/api/v1/books/{bookId}/spreads/{spreadId}` | PATCH accepte `baseVersion` |
| PUT, DELETE | `/api/v1/books/{bookId}/spreads/{spreadId}/illustration` | Comme la couverture |
| GET, POST, PUT | `/api/v1/books/{bookId}/characters` | Liste (série d'abord), création `{ name, role?, appearance?, position?, sourceCharacterId?, images? }`, PUT `{ order }` |
| GET, PATCH, DELETE | `/api/v1/characters/{characterId}` | Aussi sous `/books/{bookId}/characters/{characterId}` |
| POST | `/api/v1/characters/{characterId}/images` | JSON `{ uploadId \| base64 \| url, label?, view?, primary?, position? }` ou multipart |
| PATCH, DELETE | `/api/v1/characters/{characterId}/images/{imageId}` | `{ label?, view?, primary?, position? }` |
| GET | `/api/v1/books/{bookId}/references` | `?spreadId=`, `?characterIds=a,b`, `?views=front,back` |
| GET, POST | `/api/v1/series` | POST `{ title, fromBookId?, … }` |
| GET, PATCH | `/api/v1/series/{seriesId}` | |
| GET, POST, PUT | `/api/v1/series/{seriesId}/characters` | Comme pour un livre |
| GET | `/api/v1/series/{seriesId}/references`, `/activity` | |
| POST | `/api/v1/uploads` | Prépare un ou plusieurs envois (§ 10) |
| PUT, POST | `/api/v1/uploads/{uploadId}?token=` | **Sans clé** : le fichier (brut ou multipart `file`) |
| POST | `/api/v1/uploads/commit` | `{ uploadIds: [...] }` |
| GET, POST | `/api/v1/books/{bookId}/shares` | Liens de lecture (§ 14) ; POST réservé à l'humain |
| DELETE | `/api/v1/shares/{shareId}` | Révoque un lien ; réservé à l'humain |
| GET, POST | `/api/v1/books/{bookId}/comments` | `?spreadId=&open=1` |
| PATCH | `/api/v1/comments/{commentId}` | `{ resolved: boolean }` |
| GET | `/api/v1/books/{bookId}/activity` | `?spreadId=&characterId=&limit=` |
| POST | `/api/v1/activity/{activityId}/restore` | `?bookId=` : livre à renvoyer pour une entrée de série |
| GET | `/api/v1/books/{bookId}/events` | Flux SSE `change` (qui a modifié quoi) |
| GET | `/api/v1/assets/{assetId}?size=original\|print\|web\|thumb` | Fichiers (avec `&exp=&sig=` : lien temporaire, sans clé) |
| GET | `/api/v1/fonts` | Catalogue + polices perso |

Erreurs : `{ "error": { "code", "message", "details" } }`, codes HTTP usuels. `409 conflict` = la double page a changé depuis `baseVersion` (`details.current` donne la version actuelle).

## 6. Bonnes pratiques (rappel des consignes)

1. Lire les demandes ouvertes, puis le livre (`get_book`) et son `writing_guide` avant d'écrire. Les règles du livre et de sa série priment.
2. Texte brut, longueur cible respectée ; `check_text` avant de rendre.
3. Décrire l'image attendue dans `illustration_brief`, même sans pouvoir la produire. Indiquer les personnages présents (`character_ids`).
4. **Avant d'illustrer une double page : `get_references` avec son `spread_id`** ; donner au générateur `illustration_style` et les `signed_url` utiles (par vue).
5. Fichiers locaux : `create_upload` → `curl -T` → `commit_upload` ; jamais l'interface web, jamais de base64 pour un gros fichier.
6. Après une série d'images : `view_book_contact_sheet` pour vérifier les placements.
7. Passer `base_version` pour ne jamais écraser une saisie en cours de Guillaume ; sur 409, relire et refaire.
8. Répondre dans le fil de chaque demande traitée, puis la résoudre. Une question = un message adressé à l'humain.
9. Ne pas toucher au format, à la typographie ni au statut sans demande.

## 7. Images

Formats acceptés : JPEG, PNG, WebP, AVIF, GIF, TIFF (40 Mo au plus). SVG refusé (il pourrait porter du script). **Aucune taille minimale** : une petite image est gardée, avec un avertissement `lowResolution`. L'original est gardé pour l'impression ; La Fabrique produit une version écran (WebP 1800 px), une vignette (480 px) et, pour un TIFF, une copie JPEG pleine résolution. Résolution d'impression : `print_pixels` de `get_book` (ex. 2 434 × 2 434 px pour un carré de 20 cm, fonds perdus compris) ; chaque envoi renvoie son `dpi` sur la page du livre et `aspectRatio` si ses proportions diffèrent de la page. Les URL fournies doivent être en https et publiques (pas d'adresse du réseau local).

## 8. Personnages et références (pour l'agent qui illustre)

```bash
# Style, qui est sur la double page, à quoi ils ressemblent, et leurs images (liens valables 24 h sans clé)
curl -H "Authorization: Bearer lfab_…" "https://lafabrique.guillaume-barbier.com/api/v1/books/{bookId}/references?spreadId={spreadId}"
```

Réponse (extrait, en REST ; MCP renvoie les mêmes champs en snake_case) :

```json
{
  "spreadId": "wpds20tmbdnf",
  "illustrationStyle": "Aquarelle douce, contours encrés fins, palette pastel.",
  "illustrationBrief": "Victoire montre la mer à Mama.",
  "expiresAt": "2026-10-05T10:00:00.000Z",
  "characters": [
    {
      "name": "Victoire",
      "seriesId": "870bnihnvsdw",
      "appearance": "Cheveux châtains en queue de cheval, salopette jaune.",
      "images": [
        { "id": "…", "label": "face", "view": "front", "primary": true, "signedUrl": "https://…/api/v1/assets/…?size=print&exp=…&sig=…", "signedWebUrl": "…" }
      ],
      "byView": { "front": ["…"], "side_right": ["…"], "back": ["…"], "face": ["…"] }
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

## 10. Envoyer des fichiers locaux (sans base64, sans navigateur)

Pour un agent dont les images sont des fichiers (bac à sable de claude.ai, Claude Code, script) :

```text
create_upload { book_id, files: [
  { kind: "spread_illustration", target_id: "<spread_id>", filename: "p3.png" },
  { kind: "cover", filename: "couverture.png" } ], auto_commit: true }
→ uploads[]: { upload_id, upload_url, expires_at, curl: "curl -sS --fail-with-body -T 'p3.png' 'https://…/api/v1/uploads/…?token=…'" }

$ curl -sS --fail-with-body -T p3.png "<upload_url>"      # dans le bac à sable
→ { "status": "attached", "asset": { "width": 2480, "height": 2480 }, "dpi": 305, "warnings": [] }
```

- `kind` : `spread_illustration` (`target_id` = double page), `cover`, `character_image` (`target_id` = personnage ; `label`, `view`, `primary`), `image` (libre : à donner ensuite par `upload_id` à `create_character`, `add_character_image`, `set_illustration` ou `set_cover`). `book_id` ou `series_id` (déduits de `target_id` quand il y en a un).
- Lien **à usage unique**, valable **15 minutes**, **sans clé** (le jeton du lien suffit) ; `PUT` brut (`curl -T`) ou `POST` multipart (`curl -F file=@p3.png`). Un envoi raté (fichier illisible, coupure) peut être refait sur le même lien ; un second envoi réussi est refusé (409).
- Le fichier est traité à réception ; sans `auto_commit`, `commit_upload { upload_ids }` l'attache. Rejouer un commit renvoie le même résultat. Un envoi non utilisé est effacé après 24 h.
- Tout est attribué à l'agent qui a demandé le lien (`updated_by.type = agent`), avec le nom du fichier dans l'historique.
- **Bac à sable à liste blanche** (exécution de code de claude.ai, Cowork…) : autoriser le domaine `lafabrique.guillaume-barbier.com` (HTTPS, port 443) dans les domaines de sortie autorisés. Vérifié depuis un conteneur Claude Code le 04/10 : `curl -T` d'un PNG de 6 Mo en 0,6 s.

## 11. Séries et livres modèles

- `create_series { title, from_book_id }` : le livre modèle devient le premier livre de la série ; ses personnages (avec images), son style et ses règles montent dans la série.
- `create_book { title, series_id, spread_count }` : le nouveau livre **partage** les personnages de la série (mêmes ids, une retouche vaut partout), hérite du style et des règles, et reprend format, typographie, langue, âges et longueur cible.
- `clone_book_setup { from_book_id, title, spread_count?, include_brief? }` : nouveau livre avec la même mise en place (série, format, typographie, style, règles) et une **copie** de ses personnages propres et de leurs images ; aucune page copiée.
- `get_references` et `get_book` (`effective`) combinent série puis livre.

## 12. Règles d'écriture

| Champ | Série et livre | Effet |
|---|---|---|
| `writing_rules` | texte libre | Ton, vocabulaire, prénoms (« toujours Mama, jamais Maman »), mis dans `writing_guide` et dans les consignes MCP |
| `quote_style` | `guillemets`, `none`, `dashes`, `english` (`null` = hériter ; par défaut selon la langue) | Ponctuation des dialogues, vérifiée par `check_text` |
| `forbidden_words` | `[{ word, use? }]` | Mots refusés par `check_text`, avec le remplaçant |
| `illustration_style` | texte libre | Donné au générateur avec les références |

Sans `quote_style` fixé (ni série ni livre), `writing_guide` renvoie au brief et `check_text` ne juge pas la ponctuation des dialogues. `check_text` signale en `error` les mots interdits et les guillemets ou tirets contraires au style, en `warning` le Markdown et un texte trop long, en `info` la typographie (espaces insécables en français). Les consignes MCP rappellent les règles des séries actives à chaque connexion ; celles d'un livre se lisent dans `get_book` → `writing_guide`.

## 13. Exemple de bout en bout

[`scripts/exemple-serie.mjs`](../../scripts/exemple-serie.mjs) fait, par MCP seul et avec des fichiers locaux, ce qu'un agent fait pour lancer une série : série (style, règles, `Maman → Mama`, sans guillemets) → 4 personnages × 5 images (face, profil droit, profil gauche, dos, visage) via `create_upload` + `curl -T` + `create_character(images)` → livre de la série → texte, `check_text` (3 erreurs, corrigées) → `get_references` → illustration et couverture (`auto_commit`) → planche contact → historique.

```bash
LAFABRIQUE_KEY=lfab_… node scripts/exemple-serie.mjs --url https://lafabrique.guillaume-barbier.com [--images ./mes-images]
```

## 14. Liens de lecture ([ADR-0009](../decisions/0009-liens-de-lecture.md))

Guillaume crée depuis l'éditeur (« Partager ») un lien `https://lafabrique.guillaume-barbier.com/lire/<jeton>` qui ouvre le livre en visionneuse, sans compte : couverture et pages, rien de l'atelier, images en taille écran. Un lien par destinataire (`label`), validité 7 jours, 30 jours ou sans limite, révocable. Un agent voit la liste (`list_shares` : `label`, `expires_at`, `view_count`, `last_viewed_at`) mais ni les liens ni le moyen d'en créer.
