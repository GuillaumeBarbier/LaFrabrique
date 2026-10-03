# ADR-0004 : Google Fonts auto-hébergées et polices personnelles

## Contexte

Demande : choisir la typo parmi des Google Fonts « pré-installées et couramment utilisées pour les livres enfants », et pouvoir téléverser une police personnalisée. L'outil peut tourner sur un NAS sans accès fiable à Internet, et l'impression doit embarquer les polices.

## Décision

1. **Auto-hébergement par Fontsource** (paquets npm `@fontsource/*`, fichiers WOFF2 servis par l'app) : aucun appel à Google au chargement, fonctionnement hors ligne, rendu identique à l'écran et à l'impression.
2. **Catalogue fermé et commenté** dans `src/lib/fonts/catalog.ts`, rangé par usage (lecture, titres, manuscrites, cursive scolaire). Liste et raisons : [`design/02-typographies.md`](../design/02-typographies.md). Ajouter une police = une ligne dans le catalogue + le paquet.
3. **Polices personnelles** : TTF, OTF, WOFF, WOFF2, 10 Mo au plus, vérifiées par leur signature binaire ; stockées dans `DATA_DIR/fonts` ; nom affiché modifiable ; famille CSS interne unique (`lf-custom-<id>`) pour éviter tout conflit.
4. Les polices s'appliquent **au livre seulement**. L'interface reste en Geist.

## Conséquences

- L'image Docker embarque toutes les polices du catalogue (quelques Mo).
- Vérifier la licence d'une police perso reste la responsabilité de Guillaume (rappel en infobulle au téléversement).

## Statut

Accepté le 03/10/2026.
