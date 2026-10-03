# La Fabrique

> L'atelier où un humain et un agent IA fabriquent ensemble des livres pour enfants : l'illustration toujours sur la page de gauche, le texte toujours sur la page de droite.

Outil personnel de Guillaume, auto-hébergé sur `lafabrique.guillaume-barbier.com`.

## Navigation

| Document | Contenu |
|---|---|
| [`docs/00-vision.md`](docs/00-vision.md) | Ce qu'est La Fabrique, principes, besoins anticipés |
| [`docs/01-feuille-de-route.md`](docs/01-feuille-de-route.md) | **Feuille de route** : phases, tâches cochables, file de travail des sessions |
| [`docs/02-suivi.md`](docs/02-suivi.md) | **Suivi partagé** : journal des sessions, retours des agents, points ouverts |
| [`docs/03-actions-guillaume.md`](docs/03-actions-guillaume.md) | Ce que seul Guillaume peut faire ou trancher |
| [`docs/produit/`](docs/produit/) | Brief produit : écrans, modèle du livre, statuts, formats |
| [`docs/tech/`](docs/tech/) | Architecture, API et MCP pour les agents, déploiement |
| [`docs/design/`](docs/design/) | Design system (repris de Pro-Resa), typographies |
| [`docs/decisions/`](docs/decisions/) | Décisions structurantes (ADR) |

## Par où commencer

1. [`docs/03-actions-guillaume.md`](docs/03-actions-guillaume.md) : ce qui t'attend.
2. [`docs/01-feuille-de-route.md`](docs/01-feuille-de-route.md) : la prochaine tâche non cochée.
3. [`docs/02-suivi.md`](docs/02-suivi.md) : ce que les sessions précédentes ont fait et remonté.

## Lancer en local

```bash
pnpm install
pnpm dev            # http://localhost:3000 — le premier écran crée le compte
pnpm test           # tests unitaires
pnpm typecheck && pnpm lint
```

Les données (base SQLite, illustrations, polices) vont dans `./data` (variable `DATA_DIR`).

## Connecter un agent

**claude.ai, Claude Desktop, mobile** : Paramètres › Connecteurs › Ajouter un connecteur personnalisé, URL `https://lafabrique.guillaume-barbier.com/api/mcp`, puis « Se connecter » (OAuth).

**Avec une clé** (Claude Code, scripts) : Paramètres › Agents IA › « Créer une clé ». Puis, pour Claude Code :

```bash
claude mcp add --transport http lafabrique https://lafabrique.guillaume-barbier.com/api/mcp \
  --header "Authorization: Bearer lfab_…"
```

Détail (REST, MCP, bonnes pratiques de l'agent) : [`docs/tech/02-api-agents.md`](docs/tech/02-api-agents.md).
