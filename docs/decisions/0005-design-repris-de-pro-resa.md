# ADR-0005 : Le design system de Pro-Resa, en densité « atelier »

## Contexte

Guillaume a donné accès au dépôt Pro-Resa comme référence de design. Son design system v0.1 ([ADR-0010/0011 de Pro-Resa](https://github.com/GuillaumeBarbier/pro-resa/tree/main/docs/08-suivi/decisions)) : noir et or, gris chauds, Geist et Geist Mono, boutons en pilule où l'or monte au survol, colonne de navigation noire, zéro texte superflu, aucun contrôle natif visible.

## Décision

1. **Mêmes valeurs de tokens** (couleurs, rayons, espacements, mouvements), recopiées dans `src/styles/tokens.css` avec les mêmes noms. Pas de dépendance au dépôt Pro-Resa : les deux projets évoluent séparément.
2. **Densité « espace pro »** de Pro-Resa (corps 14 px, contrôles 40/32 px) pour la bibliothèque et les paramètres.
3. **L'éditeur est un plan de travail** : fond gris chaud, la double page posée dessus comme un objet, ombre « écran simulé ». C'est le seul endroit où la couleur et les polices fantaisie apparaissent — celles du livre.
4. **Bureau et tablette d'abord** pour l'éditeur (une double page a besoin de largeur) ; bibliothèque, lecture et échanges utilisables au téléphone.
5. Thème clair, sombre ou automatique (préférence enregistrée sur l'appareil).

## Conséquences

- La Fabrique « ressemble » à Pro-Resa : c'est voulu, Guillaume s'y retrouve.
- Changer l'accent = une variable (`--color-accent`), voir [`03-actions-guillaume.md`](../03-actions-guillaume.md).

## Statut

Accepté le 03/10/2026.
