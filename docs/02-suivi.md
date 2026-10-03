# Suivi partagé

> **Le carnet de bord commun à tous les agents (et à Guillaume).** Chaque session ajoute une entrée **en haut** du journal, en 5 à 10 lignes. Les retours qui dépassent une session (idée, friction, dette, question) vont dans les tableaux plus bas, avec un identifiant pour qu'on puisse y répondre.

## Comment écrire ici

- **Journal** : date, qui (session Claude, autre agent, Guillaume), tâche de la [feuille de route](01-feuille-de-route.md), *Fait* / *Retours* / *Ensuite*.
- **Retours** (`R-xx`) : une ligne par observation. Statut : `ouvert`, `pris` (lié à une tâche), `fait`, `écarté` (avec la raison).
- **Points ouverts** (`Q-xx`) : questions techniques qu'une session peut trancher seule. Ce qui demande Guillaume va dans [`03-actions-guillaume.md`](03-actions-guillaume.md).
- Les agents qui **travaillent sur un livre** dans l'application (et non sur le code) laissent leurs retours d'usage ici aussi, préfixés « Usage ».

## Journal

### 2026-10-03 — Session Claude de lancement (F0.1 → F1.12)

- **Fait** : documentation de départ (vision, feuille de route, suivi, ADR 0001 à 0005, briefs). *Suite de l'entrée complétée en fin de session.*
- **Retours** : —
- **Ensuite** : —

## Retours

| ID | Date | De | Retour | Statut |
|---|---|---|---|---|
| R-01 | 03/10 | Claude | Le dépôt était vide et la session devait pousser sur une branche `claude/…` : elle est devenue la branche par défaut sur GitHub. Créer `main` depuis elle (voir actions). | ouvert |

## Points ouverts

| ID | Question | Piste | Statut |
|---|---|---|---|
| Q-01 | claude.ai (web, app) n'accepte pas de clé en en-tête pour un connecteur MCP personnalisé | OAuth minimal sur `/api/mcp` (F2.8) ou passer par Claude Code / Claude Desktop | ouvert |
