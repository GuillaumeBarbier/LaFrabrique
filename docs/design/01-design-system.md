# Design system

> Repris de Pro-Resa v0.1 ([ADR-0005](../decisions/0005-design-repris-de-pro-resa.md)). Source de vérité des valeurs : [`src/styles/tokens.css`](../../src/styles/tokens.css). Composants : [`src/components/ui/`](../../src/components/ui/).

## Principes

1. **Noir, blanc, or.** Blanc dominant, noir pour agir, or `#EFBF04` pour signer. Le bleu `#0434EF` ne sert qu'au focus.
2. **Le livre porte la couleur.** L'interface reste neutre ; seules les pages du livre ont des couleurs et des polices fantaisie.
3. **Zéro texte superflu.** Une action principale par écran ; l'aide vit dans une pastille « ? ».
4. **Aucun contrôle natif visible.** Listes, cases, interrupteurs, couleurs, nombres : tout est redessiné (accessible au clavier).
5. **Tout passe par les tokens.** Aucune valeur en dur dans un composant.

## Ajouts propres à La Fabrique

| Token / élément | Valeur | Pourquoi |
|---|---|---|
| `--color-agent` / `--color-agent-soft` | violet `#6D4BD1` / `#EFE9FC` (sombre : `#B9A3FF` / `#221A3A`) | Distinguer d'un coup d'œil ce que fait l'agent (badge « Claude travaille », marque sur la vignette, historique, messages). Couleur sémantique, comme succès ou alerte, jamais décorative |
| `--workbench` | `#ECEBE5` (sombre `#1A1A18`) | Le plan de travail de l'éditeur, sur lequel la double page est posée |
| Statuts de livre | Idée (gris), Écriture (bleu), Illustration (or), Relecture (orange), Terminé (vert) | Pastilles de Pro-Resa, une teinte par étape |

## Composants

| Composant | Fichier | Notes |
|---|---|---|
| Bouton, lien-bouton, bouton icône | `button.tsx` | Pilule ; l'or monte au survol (360 ms) ; appui 0,97 ; infobulle `tip` pour les boutons icône |
| Champ, zone de texte, « ? » | `field.tsx` | Libellé au-dessus, jamais placeholder seul ; erreur avec icône |
| Liste déroulante | `select.tsx` | Panneau flottant, clavier, recherche dès 9 options, groupes, aperçu (polices) |
| Interrupteur, segment, fenêtre, menu « … », badge | `controls.tsx` | Fenêtre = `<dialog>` stylé ; menu au clavier |
| Couleur | `controls.tsx` (`ColorField`) | Pastilles + code hexadécimal, « revenir au livre » |
| Pas à pas | `controls.tsx` (`Stepper`) | Tailles en points, interligne |
| Dépôt de fichier, bloc « copier », état vide, squelette | `controls.tsx` | |
| Notification | `toast.tsx` | Noire, icône or, action « Annuler » quand c'est possible |

## Écrans

| Écran | Densité | Notes |
|---|---|---|
| Connexion, installation | Site | Bande noire à gauche avec la double page dessinée |
| Bibliothèque, échanges, paramètres | Espace pro (14 px, contrôles 40/32) | Colonne noire, trait or sur l'écran courant |
| Éditeur | Plan de travail | Vignettes à gauche, double page au centre (ombre « écran simulé »), réglages à droite |
| Lecture | Plein écran sombre | Le livre seul |
| Impression | Feuilles à taille réelle | Barre d'options masquée à l'impression |

## Le rendu des pages

Une page est un *conteneur* CSS : tailles de texte et marges sont en `cqw`, rapportées à la largeur de la page en points. Une vignette est donc une miniature exacte, et l'impression tombe juste au point près ([`src/components/book/pages.module.css`](../../src/components/book/pages.module.css)).
