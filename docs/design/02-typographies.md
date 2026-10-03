# Typographies du livre

> Décision : [ADR-0004](../decisions/0004-polices.md). Catalogue : [`src/lib/fonts.ts`](../../src/lib/fonts.ts). Toutes sont des Google Fonts auto-hébergées (Fontsource), sous licence OFL : utilisables pour imprimer et vendre un livre.

## Par défaut

- **Titre : Fredoka** — ronde et joyeuse, se lit de loin sur une couverture.
- **Texte : Andika** — dessinée par SIL pour les lecteurs débutants : « a » et « g » à une seule panse (comme à l'école), I/l/1 bien distincts.
- Corps 18 pt, interligne 1,45, texte `#1F1B16` sur page crème `#FFFDF7`.

## Catalogue (28 polices)

| Usage | Polices | Quand |
|---|---|---|
| **Lecture** | Andika, Lexend, Atkinson Hyperlegible Next, Nunito, Quicksand, Comic Neue, Playpen Sans | Texte courant des albums 3-8 ans ; Andika, Lexend et Atkinson pour les lecteurs débutants ou en difficulté |
| **Album classique** (serif) | Literata, Lora, Alegreya, Gelasio, Fraunces | Contes, textes plus longs, ambiance « livre d'autrefois » |
| **Titres** | Fredoka, Baloo 2, Chewy, Luckiest Guy, Bubblegum Sans, Grandstander, Sniglet, Sour Gummy | Couverture, page de titre, mots mis en scène |
| **Manuscrites** | Patrick Hand, Schoolbell, Gaegu, Caveat, Mali, Short Stack | Lettres, carnets, bulles, voix d'un personnage |
| **Cursive scolaire** | Playwrite FR Moderne, Playwrite FR Trad | L'écriture des cahiers français : idéal pour les 5-7 ans qui apprennent la cursive |

Graisses embarquées : 400 et 700 quand elles existent (Sniglet : 800). Sous-ensemble latin : français, anglais, espagnol, allemand, italien (œ, « », espaces fines comprises).

## Polices personnelles

Paramètres › Typographies : TTF, OTF, WOFF ou WOFF2, 10 Mo au plus, une graisse par fichier. Elles apparaissent dans « Mes polices » des listes de l'éditeur. Une police utilisée par un livre ne peut pas être supprimée (le livre changerait sans prévenir). **Licence** : vérifier qu'elle autorise l'impression (licence « desktop » ou « ebook » selon l'usage).

## Repères de lisibilité jeunesse

| Âge | Corps conseillé | Mots par double page |
|---|---|---|
| 0-3 ans | 24-32 pt | 0 à 15 |
| 3-5 ans | 18-24 pt | 15 à 40 |
| 5-7 ans | 16-20 pt | 40 à 80 |
| 7 ans et + | 14-16 pt | 80 à 150 |

L'éditeur propose la longueur cible selon l'âge du livre et colore le compteur de mots au-delà.
