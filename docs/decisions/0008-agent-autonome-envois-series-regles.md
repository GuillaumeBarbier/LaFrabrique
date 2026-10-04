# ADR-0008 : Agent autonome — envoi direct de fichiers, séries, règles d'écriture, MCP strict

## Contexte

Le 04/10/2026, Guillaume fait produire des livres en série par un agent (Claude) branché en MCP. Les images sont générées hors de La Fabrique (Gemini, dans le navigateur) et arrivent dans le bac à sable de l'agent sous forme de **fichiers locaux** (JPEG/PNG, 100 Ko à 4 Mo). Faute d'outil pour les envoyer, l'agent pilotait l'interface web dans Chrome : lent, fragile, mauvaise fiche personnage sélectionnée, images inversées, envois attribués à l'humain connecté. Le base64 dans un appel d'outil n'est pas une issue (des millions de caractères). D'autres frictions : `age_min` ignoré en silence (le schéma attendait `ageMin`), réponses d'écriture qui renvoient le livre entier, aucune notion de série (personnages et règles à refaire à chaque livre), règles d'écriture codées en dur dans les consignes (« guillemets ») alors que la série de Guillaume n'en veut pas et écrit « Mama ».

## Décision

1. **Envoi direct par URL signée** : `create_upload` (MCP) / `POST /api/v1/uploads` (REST) donne, par fichier, une URL `/api/v1/uploads/{id}?token=…` **à usage unique, 15 minutes, sans clé** (jeton aléatoire stocké haché) et la commande `curl -T` à lancer. Le fichier est traité à réception (dimensions, dpi sur la page du livre, versions écran) ; `commit_upload` l'attache à sa cible (double page, couverture, personnage), ou `auto_commit` le fait dès réception. Une image « libre » (`kind: image`) se donne ensuite par `upload_id` aux outils d'image. Jamais de refus pour une petite image : avertissement `lowResolution` (et `aspectRatio`). Tout est attribué à qui a demandé le lien. Envoi non utilisé effacé après 24 h.
2. **Séries** : une table `series` porte les personnages partagés (un personnage appartient à un livre **ou** à une série), le style d'illustration, les règles d'écriture et les valeurs par défaut des nouveaux livres. Un livre de la série **voit** ses personnages (liés, pas copiés). `create_series(from_book_id)` fait d'un livre modèle le premier de la série ; `clone_book_setup` copie la mise en place d'un livre (personnages et images **copiés**, fichiers compris, pour qu'une suppression ne les emporte pas).
3. **Règles d'écriture en données** : `writing_rules` (texte libre), `quote_style` (`guillemets`, `none`, `dashes`, `english`) et `forbidden_words` sur la série et sur le livre (le livre s'ajoute à la série, son style de guillemets l'emporte). `get_book` renvoie les règles effectives et un `writing_guide` ; `check_text` les vérifie. Les consignes MCP ne codent plus de typographie : elles renvoient à ces règles et rappellent celles des séries actives à chaque connexion.
4. **MCP strict et léger** : paramètres et réponses en **snake_case** (REST reste en camelCase, comme l'interface) ; schémas `additionalProperties: false`, un paramètre inconnu est une erreur qui nomme le paramètre attendu. Les outils d'écriture répondent court (`id`, `version`, `changed`, avertissements), `verbose: true` pour l'objet complet. `get_book` a `include` et `summary` ; `view_illustration` vise une page, la couverture ou une image de référence ; `view_book_contact_sheet` montre tout le livre sur une image.
5. **Vues normalisées des références** : `front`, `three_quarter`, `side_left`, `side_right`, `back`, `face`, `sheet`, `expression:<nom>`, `other`, déduites de l'étiquette française si absentes ; `get_references` classe les images par vue (`by_view`) et donne le style d'illustration.
6. **Traçabilité** : chaque changement d'illustration ou de couverture a sa propre entrée d'historique (plus de regroupement sur 5 minutes pour les images), restaurable ; `details` dit quelle image (fichier, dimensions, dpi) sur quelle cible. L'historique d'un livre montre aussi celui de sa série.

## Conséquences

- Migration 4 : tables `series` et `uploads` ; colonnes `books.series_id`, `illustration_style`, `writing_rules`, `quote_style`, `forbidden_words`, `character_images.view` ; tables `characters` (livre **ou** série) et `activity` (livre ou série, `details`) reconstruites.
- Le domaine doit être joignable depuis le bac à sable de l'agent : sur claude.ai, autoriser `lafabrique.guillaume-barbier.com` dans les domaines de sortie de l'exécution de code.
- Les noms d'outils restent, mais leurs paramètres changent (`illustrationBrief` → `illustration_brief`, `characterIds` → `character_ids`, `parentId` → `parent_id`…) : un agent déjà connecté doit relire les outils (rouvrir la conversation). L'erreur explicite le guide.
- L'image Docker embarque `fontconfig` et `fonts-dejavu-core` pour le texte des planches contact.
- Génération intégrée (Gemini/Imagen dans La Fabrique) : non faite, chiffrée dans la feuille de route (F3.2).

## Statut

Accepté le 04/10/2026.
