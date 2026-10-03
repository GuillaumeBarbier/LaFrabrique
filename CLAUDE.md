# Consignes pour les sessions Claude sur ce repo

## Contexte
La Fabrique : atelier web où Guillaume et un agent IA créent des livres pour enfants (illustration à gauche, texte à droite). Outil personnel, auto-hébergé sur `lafabrique.guillaume-barbier.com`. Commencer par `README.md`, puis `docs/01-feuille-de-route.md` (file de travail), `docs/02-suivi.md` (journal et retours) et `docs/03-actions-guillaume.md`.

## Règles
- **Pousser sur `main`** par petits commits fréquents, messages en français. Pas de PR sauf demande explicite. (Si la session impose une autre branche, suivre la consigne de la session.)
- **Sobriété** : au plus 2 agents en parallèle, une session = une tâche de la feuille de route.
- Docs en français ; code, identifiants et commentaires techniques en anglais.
- **Tutoyer Guillaume** dans les réponses et les documents qui s'adressent à lui. L'interface reste neutre (infinitifs : « Créer un livre », « Enregistrer »).
- Respecter les ADR (`docs/decisions/`). Pour changer une décision, écrire une nouvelle ADR.
- Design repris de Pro-Resa (`docs/design/01-design-system.md`) : zéro texte superflu, infobulles plutôt que paragraphes, aucun contrôle natif visible, noir/blanc + or, tout style passe par les tokens (`src/styles/tokens.css`). Seul le livre lui-même porte de la couleur et des polices fantaisie.
- Tech : TypeScript strict, une seule app Next.js, SQLite + fichiers dans `DATA_DIR`, Docker (`docs/tech/`).
- **Tout ce que l'interface fait passe par l'API `/api/v1`** : l'agent doit pouvoir faire ce que l'humain fait (sauf supprimer un livre ou gérer les clés). Toute nouvelle fonction = route REST + outil MCP + doc `docs/tech/02-api-agents.md`.
- Ne jamais committer de secret ni de contenu de `data/`.

## Fin de session
1. Cocher la tâche dans `docs/01-feuille-de-route.md` (ou noter où elle en est).
2. Ajouter une entrée datée dans `docs/02-suivi.md` : fait, retours, points ouverts (5 lignes suffisent).
3. Ajouter dans `docs/03-actions-guillaume.md` ce qui bloque et que seul Guillaume peut faire ; cocher ce qui est visiblement fait.
4. `pnpm typecheck && pnpm lint && pnpm test`, puis commit + push.
