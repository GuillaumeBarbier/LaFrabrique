# Architecture

> Décisions : [ADR-0001](../decisions/0001-application-unique-sqlite.md) (application unique, SQLite), [ADR-0002](../decisions/0002-agents-par-cle-api-et-mcp.md) (agents), [ADR-0003](../decisions/0003-structure-du-livre.md) (livre), [ADR-0004](../decisions/0004-polices.md) (polices).

## Vue d'ensemble

```
Navigateur (Guillaume) ──cookie──┐
                                 ├──► Next.js (un processus) ──► SQLite  DATA_DIR/lafabrique.db
Agent (Claude…) ──Bearer lfab_──┘        │  /api/v1  REST            fichiers DATA_DIR/assets/<id>/
                                         │  /api/mcp  MCP (HTTP)
                                         │  /api/v1/books/{id}/events  SSE (direct)
                                         └  pages : bibliothèque, éditeur, lecture, impression, paramètres
```

## Stack

| Couche | Choix |
|---|---|
| Langage | TypeScript strict (`noUncheckedIndexedAccess`) |
| Application | Next.js 16 (App Router, sortie `standalone`), React 19 |
| Données | SQLite via `better-sqlite3` (WAL, clés étrangères), SQL écrit à la main, migrations numérotées |
| Validation | `zod` 4, schémas partagés REST / MCP |
| Images | `sharp` : original + `web.webp` (1800 px) + `thumb.webp` (480 px) ; `print.jpg` pour un TIFF |
| MCP | `@modelcontextprotocol/sdk`, transport HTTP « streamable » sans état, réponses JSON |
| Polices | Fontsource (Google Fonts auto-hébergées), polices perso servies par l'app |
| Icônes | `lucide-react` (trait 1,5 px, comme Pro-Resa) |
| Tests | Vitest (services, auth, utilitaires) |

## Arborescence

```
src/
  app/                    pages et routes
    (auth)/               connexion, installation (premier compte)
    (app)/                coquille avec colonne noire : bibliothèque, échanges, paramètres
    livres/[bookId]/      éditeur, lire/, imprimer/
    api/                  auth/, health/, mcp/, v1/…
    book-fonts.ts         imports Fontsource (synchronisé avec lib/fonts.ts par un test)
  components/
    ui/                   design system (bouton, champ, liste, interrupteur, segment, fenêtre…)
    book/                 rendu des pages (partagé éditeur / lecture / impression / vignettes)
  lib/                    code partagé client + serveur : formats, statuts, polices, types d'API
  server/
    db/                   connexion, migrations
    auth/                 mots de passe (scrypt), sessions, clés API, limitation des essais
    services/             livres et doubles pages, historique, échanges, polices
    http.ts               acteur (humain ou agent), droits, erreurs JSON, anti-CSRF
    events.ts             bus d'événements en mémoire (direct)
    mcp.ts                outils MCP
    agent-guide.ts        consignes données aux agents
```

## Données

Tables : `users`, `sessions`, `api_keys`, `books`, `spreads`, `assets`, `fonts`, `comments`, `activity`, `schema_migrations`. Schéma : [`src/server/db/migrations.ts`](../../src/server/db/migrations.ts).

- **Une seule source de vérité par écriture** : chaque modification passe par un service qui écrit la ligne, l'historique (`activity`, avec l'état d'avant en JSON) et publie un événement.
- **Concurrence** : chaque double page a un `version`. L'éditeur et les agents envoient `baseVersion` ; un écart renvoie `409` avec la version actuelle. L'éditeur propose alors « garder la mienne / prendre la sienne ».
- **Fichiers** : jamais supprimés quand une page change (la restauration en a besoin). Ils partent avec le livre. Le ménage des fichiers orphelins viendra avec les sauvegardes (F2.3).

## Sécurité

- Connexion : mot de passe scrypt (N = 2¹⁵), 8 essais / 15 min par IP, session aléatoire de 32 octets stockée hachée, cookie `HttpOnly` `SameSite=Lax` `Secure` derrière https, 30 jours glissants.
- Premier compte : créé au premier lancement ; `SETUP_TOKEN` peut l'exiger (instance exposée avant création du compte).
- Mutations par cookie : en-tête `Origin` vérifié (en plus de `SameSite`).
- Clés API : `lfab_` + 240 bits, hachées SHA-256, révocables.
- Téléversements : signature binaire vérifiée (images par `sharp`, polices par leur en-tête), SVG refusé, tailles plafonnées ; URL d'image : https publique uniquement, résolution DNS vérifiée (pas d'adresse privée), pas de redirection.
- En-têtes : `X-Robots-Tag: noindex`, `robots.txt` fermé, `X-Frame-Options: DENY`, `nosniff`.

## Direct (F1.9)

`GET /api/v1/books/{id}/events` (SSE) émet un événement par modification (type, double page, auteur, `clientId`). L'onglet qui a causé l'événement l'ignore ; les autres rechargent le livre (250 ms de regroupement). Une page en cours de saisie garde son texte local : le conflit éventuel apparaît à l'enregistrement suivant.

## Faire évoluer

- Une fonction nouvelle = service + route REST + outil MCP + ligne dans [`02-api-agents.md`](02-api-agents.md).
- Un schéma qui change = nouvelle migration (jamais modifier une migration livrée).
- Une police de plus = paquet `@fontsource/…` + `src/app/book-fonts.ts` + `src/lib/fonts.ts` (un test vérifie la cohérence).
