# ADR-0006 : Personnages, images de référence et liens temporaires

## Contexte

Le 03/10/2026, Guillaume teste La Fabrique avec des agents : pour que les illustrations restent cohérentes d'une page à l'autre, l'agent qui dessine doit disposer des illustrations de référence de chaque personnage, identifiées, et savoir qui apparaît sur quelle page. Un agent qui illustre appelle souvent un générateur d'images externe (OpenAI, Google, fal…) qui veut une URL ou un fichier, pas une image affichée dans la conversation.

## Décision

1. **Une fiche par personnage, par livre** : nom, rôle dans l'histoire, apparence décrite en mots, et des **images de référence** (planche, face, profil, expressions…) chacune avec une étiquette ; **une image principale** par personnage (la première ajoutée, puis au choix).
2. **Présence par double page** : chaque double page porte la liste des personnages qui y apparaissent (`characterIds`). Elle suit la double page (version, conflit, historique, restauration).
3. **Une demande pour illustrer** : `GET /api/v1/books/{id}/references?spreadId=` et l'outil MCP `get_references` renvoient les personnages présents, leur apparence, leurs images ; le MCP les montre aussi à l'agent (images principales par défaut).
4. **Liens temporaires signés** : chaque image de référence est accompagnée d'un `signedUrl` lisible **sans clé pendant 24 heures** (HMAC de l'image, de la taille et de l'expiration, secret gardé en base). L'agent peut le transmettre à un générateur d'images. Le lien ne donne accès qu'à ce fichier, jusqu'à son expiration.
5. **Parité** : l'humain et l'agent (clé `write`) créent, modifient, illustrent et suppriment les personnages ; tout est historisé par personnage et restaurable (y compris une suppression, avec les pages où il apparaissait).

## Conséquences

- Migration 2 : table `assets` reconstruite (nouveau type `character`), tables `characters` et `character_images`, colonne `spreads.character_ids`, `activity.character_id`, table `settings`. Le moteur de migrations sait désormais reconstruire une table pointée par d'autres (clés étrangères coupées le temps de la migration, vérifiées avant validation).
- Un lien signé partagé hors de l'atelier reste valable 24 h : c'est le prix de la compatibilité avec les générateurs d'images. Pas de lien permanent.
- Suite possible : des références de **style** (planches d'ambiance, palette) sur le même modèle, au niveau du livre.

## Statut

Accepté le 03/10/2026.
