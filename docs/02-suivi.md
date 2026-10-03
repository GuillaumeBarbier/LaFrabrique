# Suivi partagé

> **Le carnet de bord commun à tous les agents (et à Guillaume).** Chaque session ajoute une entrée **en haut** du journal, en 5 à 10 lignes. Les retours qui dépassent une session (idée, friction, dette, question) vont dans les tableaux plus bas, avec un identifiant pour qu'on puisse y répondre.

## Comment écrire ici

- **Journal** : date, qui (session Claude, autre agent, Guillaume), tâche de la [feuille de route](01-feuille-de-route.md), *Fait* / *Retours* / *Ensuite*.
- **Retours** (`R-xx`) : une ligne par observation. Statut : `ouvert`, `pris` (lié à une tâche), `fait`, `écarté` (avec la raison).
- **Points ouverts** (`Q-xx`) : questions techniques qu'une session peut trancher seule. Ce qui demande Guillaume va dans [`03-actions-guillaume.md`](03-actions-guillaume.md).
- Les agents qui **travaillent sur un livre** dans l'application (et non sur le code) laissent leurs retours d'usage ici aussi, préfixés « Usage ».

## Journal

### 2026-10-03 — Session Claude de lancement (F0.1 → F1.12)

- **Fait** : documentation (vision et besoins anticipés, feuille de route, ADR 0001 à 0005, briefs produit / tech / design) ; application complète de la phase 1 : connexion et premier compte, bibliothèque (statut sous le titre), éditeur de doubles pages (texte enregistré tout seul, illustrations, brief d'illustration, couverture, typographie, 28 Google Fonts auto-hébergées + polices perso), échanges humain ↔ agent, historique restaurable, direct (SSE) avec détection de conflit, lecture plein écran, impression PDF à taille réelle ; API REST `/api/v1` et serveur MCP `/api/mcp` (22 outils) ; Dockerfile, CI, publication GHCR, compose VPS, tâche NAS.
- **Vérifié** : 18 tests unitaires ; typage et lint propres ; build de production ; parcours complet par l'API et par MCP (clé, livre, texte, illustration en base64, message à l'humain, droits) ; dans Chromium : connexion, saisie et enregistrement, conflit avec l'agent, mise à jour en direct, téléversement avec alerte de résolution, historique, thème sombre, téléphone ; image Docker construite et lancée (volume, utilisateur 1001, `SETUP_TOKEN`).
- **Retours** : R-01 à R-05.
- **Ensuite** : Guillaume choisit le serveur et crée `main` ([actions](03-actions-guillaume.md)) ; puis F1.13 (recette en ligne avec Claude branché), puis F2.1 (personnages).

## Retours

| ID | Date | De | Retour | Statut |
|---|---|---|---|---|
| R-01 | 03/10 | Claude | Le dépôt était vide et la session devait pousser sur une branche `claude/…` : elle est devenue la branche par défaut sur GitHub. Créer `main` depuis elle (voir actions). | ouvert |
| R-02 | 03/10 | Claude | `better-sqlite3` 13 embarque ses binaires : ne pas le remettre dans `pnpm.onlyBuiltDependencies`, sinon pnpm lance `node-gyp` et l'image `slim` (sans Python ni compilateur) ne se construit plus. | fait |
| R-03 | 03/10 | Claude | Next 16 : le nouveau lint React (compilateur) refuse `setState` dans un effet et la réécriture de variables pendant le rendu. Motifs retenus : état dérivé pendant le rendu (`seen`/`setSeen`), file de sauvegarde hors React (`SpreadSaver` dans `use-book.ts`). | fait |
| R-04 | 03/10 | Claude | Les tests navigateur de la session vivent hors dépôt (bloc-notes de session). À reprendre en vrais tests Playwright (F2.9) : connexion, saisie + enregistrement, conflit, direct, téléversement. | pris (F2.9) |
| R-05 | 03/10 | Claude | Les fichiers remplacés ne sont jamais supprimés (la restauration en a besoin) : le dossier de données grossit avec les itérations d'illustrations. | pris (F2.10) |

## Points ouverts

| ID | Question | Piste | Statut |
|---|---|---|---|
| Q-01 | claude.ai (web, app) n'accepte pas de clé en en-tête pour un connecteur MCP personnalisé | OAuth minimal sur `/api/mcp` (F2.8) ou passer par Claude Code / Claude Desktop | ouvert |
| Q-02 | Le texte est brut (paragraphes). Mettre un mot en gras ou en grand demandera un format (Markdown léger ? segments ?) lisible par l'agent | À trancher avec F2.6, nouvelle ADR | ouvert |
| Q-03 | L'impression passe par « Enregistrer en PDF » du navigateur : texte vectoriel et polices embarquées, mais pas de PDF/X ni de traits de coupe | Export serveur en phase 4 (F4.1) selon l'imprimeur choisi | ouvert |
