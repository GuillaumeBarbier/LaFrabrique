# Brief produit

> Le *quoi* de La Fabrique. Le *pourquoi* est dans la [vision](../00-vision.md), le *quand* dans la [feuille de route](../01-feuille-de-route.md).

## Écrans

| Écran | Adresse | Ce qu'on y fait |
|---|---|---|
| Installation | `/installation` | Premier lancement seulement : créer le compte de l'atelier |
| Connexion | `/connexion` | E-mail + mot de passe |
| **Bibliothèque** | `/` | Couvertures, **statut sous le titre**, avancement, messages de l'agent en attente ; filtres Tous / En cours / Terminés / Archivés ; recherche ; créer, ouvrir, lire, archiver, supprimer |
| **Éditeur** | `/livres/{id}` | Vignettes (couverture + doubles pages, glisser pour réordonner) ; double page au centre : illustration à gauche (déposer une image), texte à droite (écrire directement, enregistré tout seul) ; panneaux Page, Livre, Échanges, Historique |
| Lecture | `/livres/{id}/lire` | Plein écran ; flèches, espace, glisser du doigt, Échap |
| Impression | `/livres/{id}/imprimer` | Feuilles à taille réelle, options couverture / doubles pages / fonds perdus, points à vérifier, « Imprimer / PDF » |
| Échanges | `/echanges` | Tout ce qui attend une réponse : de l'agent pour vous, de vous pour l'agent |
| Paramètres | `/parametres/…` | Agents IA (clés, branchement), Typographies (catalogue, polices perso), Compte, Apparence |

## Le livre

- **Structure fixe** : couverture, page de titre (recto), puis des doubles pages *illustration à gauche, texte à droite* ([ADR-0003](../decisions/0003-structure-du-livre.md)).
- **Statuts** : Idée → Écriture → Illustration → Relecture → Terminé. Visibles sous le titre dans la bibliothèque, réglables dans la barre de l'éditeur (par l'humain ou l'agent).
- **Formats** : carré 20 × 20 (défaut), petit carré 15 × 15, carré 21,6 (8,5″, KDP), grand carré 25 × 25, portrait 21 × 28, paysage 28 × 21.
- **Brief du livre** : histoire, ton, personnages (nom, âge, caractère, apparence), style d'illustration, à éviter. L'agent le lit avant chaque intervention.
- **Par double page** : texte, brief d'illustration, cadrage de l'image (remplir / image entière), alignements, taille, couleur de page, notes.
- **Typographie du livre** : police du titre et du texte, tailles en points, interligne, couleurs, alignements par défaut.
- **Complétude** : une double page est complète quand elle a un texte et une illustration ; la bibliothèque affiche la proportion.

## Travailler avec l'agent

1. Guillaume crée une clé « Claude » (Paramètres › Agents IA) et branche Claude (une commande à copier).
2. Il écrit le brief du livre, puis laisse des **demandes** à l'agent depuis l'éditeur (« Écris les 12 doubles pages », « Rends la page 3 plus drôle »), sur le livre ou sur une page.
3. L'agent lit ses demandes, travaille (texte, briefs d'illustration, images s'il sait en produire), répond dans chaque fil et le marque résolu. Une question → un message « pour vous ».
4. Pendant ce temps l'éditeur se met à jour **en direct** : badge « Claude travaille », marque violette sur la vignette modifiée.
5. Si les deux écrivent sur la même page, l'éditeur demande quelle version garder ; l'autre reste dans l'historique.
6. Tout est attribué et **restaurable** (Historique › flèche de retour), y compris une page supprimée.

## Règles d'interface

- Français, formulations neutres (infinitifs), vouvoiement quand il faut s'adresser à l'utilisateur.
- Retour immédiat : enregistrement automatique (pastille « Enregistré »), notifications avec « Annuler » pour les gestes destructifs (retirer une illustration, supprimer une page, archiver).
- Supprimer un livre demande une confirmation et n'est possible que pour l'humain.
