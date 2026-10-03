# ADR-0001 : Une seule application Next.js, SQLite et un dossier de données

## Contexte

La Fabrique est un outil personnel : un humain, quelques agents. Il doit tourner aussi bien sur le KVM4 (à côté de Pro-Resa) que sur un NAS Synology, qui peut être en ARM et a peu de mémoire. Pro-Resa, la référence de design, est un monorepo pnpm + Turborepo avec NestJS, PostgreSQL et Redis : bien pour un SaaS, trop lourd ici.

## Décision

1. **Une seule application Next.js** (App Router, TypeScript strict) qui sert l'interface, l'API REST `/api/v1` et le serveur MCP `/api/mcp`. Sortie `standalone`, un seul processus Node.
2. **SQLite** (`better-sqlite3`, mode WAL) pour les données, **fichiers sur disque** pour les illustrations et les polices. Tout vit dans `DATA_DIR` (`/data` dans le conteneur) : sauvegarder ou déménager La Fabrique = copier un dossier.
3. **SQL écrit à la main** avec des migrations numérotées (`src/server/db/migrations.ts`) jouées au démarrage, validation des entrées par `zod`. Pas d'ORM : le schéma est petit et lisible.
4. **Images traitées par `sharp`** : chaque illustration garde son original (impression) et reçoit une version écran et une vignette en WebP.
5. **Une image Docker multi-architecture** (amd64, arm64), publiée sur GHCR.

## Conséquences

- Un seul processus : le direct (SSE) passe par un bus d'événements en mémoire. Si un jour plusieurs instances tournent, il faudra un bus partagé — non prévu.
- Pas de PostgreSQL à administrer ; la sauvegarde à chaud se fait par `VACUUM INTO` (F2.3).
- Modules natifs (`better-sqlite3`, `sharp`) : précompilés pour linux amd64/arm64, rien à compiler dans l'image.

## Statut

Accepté le 03/10/2026 (session de lancement). À revoir si La Fabrique devient multi-utilisateur.
