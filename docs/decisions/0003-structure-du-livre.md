# ADR-0003 : Structure fixe du livre — illustration à gauche, texte à droite

## Contexte

Guillaume : « les livres sont toujours conçus avec une illustration sur la page de gauche et le texte sur la page de droite ». Un livre imprimé commence pourtant par une page de droite (recto) : la page 1 est à droite.

## Décision

1. **L'unité de travail est la double page** (`spread`) : une illustration (page paire, à gauche) et un texte (page impaire, à droite). Pas d'autre gabarit.
2. **Pagination imprimée** : couverture à part ; page 1 = **page de titre** (recto, à droite) générée depuis le titre, l'auteur et la police du titre ; puis chaque double page occupe les pages 2-3, 4-5… ; une **page de fin** (recto vide ou colophon) complète si besoin. L'outil indique le total et prévient s'il n'est pas multiple de 4 (contrainte des cahiers d'impression).
3. **Le format** (largeur × hauteur d'une page, en mm) est choisi par livre parmi une liste ; il fixe le ratio d'affichage, l'impression et l'alerte de résolution (300 dpi + 3 mm de fonds perdus).
4. **La typographie est réglée au niveau du livre** (police du titre, du texte, taille en points, interligne, couleurs, alignements) et **ajustable par double page** (alignements, position verticale, taille, couleur de page).
5. Le texte est du **texte brut à paragraphes** (une ligne vide = nouveau paragraphe). La mise en forme fine (gras, mots en grand) viendra en F2.6.

## Conséquences

- L'API reste simple : un livre = des métadonnées + une liste ordonnée de doubles pages.
- Une page « illustration pleine double page » n'existe pas : si le besoin arrive, nouvelle ADR.

## Statut

Accepté le 03/10/2026.
