# ADR-0009 : Liens de lecture (visionneuse sans compte)

## Contexte

Le 04/10/2026, Guillaume veut faire lire un livre à quelqu'un qui n'a pas de compte (famille, classe, relecteur), sans export ni pièce jointe. La Fabrique n'a qu'un compte humain ([ADR-0002](0002-agents-par-cle-api-et-mcp.md)) et rien n'y est public. C'était la tâche F4.4 de la feuille de route.

## Décision

1. **Un lien par destinataire** : `https://lafabrique.guillaume-barbier.com/lire/<jeton>`, jeton aléatoire de 192 bits, avec une étiquette (« Mamie ») et une validité au choix (7 jours, 30 jours, sans limite). Plusieurs liens par livre ; chacun se révoque seul, tout de suite.
2. **La visionneuse, pas l'atelier** : le lien ouvre le mode lecture existant (couverture puis doubles pages, flèches, glisser, plein écran ; sur un téléphone en portrait, l'illustration au-dessus de son texte). Le navigateur du lecteur ne reçoit que ce qu'il faut pour dessiner les pages : titre, auteurs, format, typographie, textes, images. Ni brief, ni brief d'illustration (même en texte alternatif), ni notes, ni personnages, ni échanges, ni historique, ni noms d'agents.
3. **Images servies par le lien** : `/api/share/<jeton>/assets/<id>` ne sert que la couverture et les illustrations de ce livre, en taille écran (WebP 1 800 px) ou vignette ; jamais l'original d'impression. Les polices perso du livre passent par `/api/share/<jeton>/fonts/<id>`. Tout s'arrête dès que le lien expire ou est révoqué (pas de lien signé qui survivrait 24 h).
4. **Le livre en direct** : le lecteur voit l'état actuel du livre (pas une copie figée) ; révoquer et recréer un lien suffit pour couper.
5. **Réservé à l'humain** : créer et révoquer un lien, c'est donner un accès, comme une clé. Les agents voient avec qui le livre est partagé (`list_shares`, `GET …/shares` : étiquette, validité, lectures) mais pas les liens.
6. **Jeton gardé lisible** en base, pour pouvoir recopier le lien plus tard : il n'ouvre qu'un livre en lecture, et la base contient de toute façon les livres. Les clés API, elles, restent hachées.
7. **Traces** : nombre de lectures et dernière lecture par lien ; création et révocation dans l'historique du livre. Pas d'indexation (`noindex`), pas d'aperçu riche (ni description ni image dans les métadonnées : une messagerie montre au plus le titre).

## Conséquences

- Migration 5 : table `shares`.
- Un aperçu de lien par une messagerie compte comme une lecture.
- Phase 4 inchangée pour le reste (export imprimeur, EPUB) ; la narration audio pourra se brancher sur la même visionneuse.

## Statut

Accepté le 04/10/2026.
