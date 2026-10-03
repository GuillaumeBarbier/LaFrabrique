# Vision — La Fabrique

## En une phrase

Un atelier où Guillaume et un agent IA écrivent, illustrent et mettent en page des livres pour enfants, ensemble, sur le même livre, en voyant le travail de l'autre en direct.

## Ce que La Fabrique est

- **Un outil de création**, pas une plateforme : un seul propriétaire, des agents invités par clé API.
- **Un format fixe** : chaque double page = une illustration à gauche, le texte à droite ([ADR-0003](decisions/0003-structure-du-livre.md)). La contrainte simplifie tout : l'édition, l'API, l'export.
- **Un espace partagé humain ↔ agent** : l'agent lit le brief du livre, écrit, propose, dépose des illustrations, répond aux demandes ; l'humain relit, corrige, tranche, et peut toujours revenir en arrière.

## Ce que La Fabrique n'est pas (pour l'instant)

- Pas un service public : pas d'inscription, pas de vente, pas de partage public par défaut.
- Pas un logiciel de PAO généraliste : pas de calques, pas de mise en page libre.
- Pas un générateur automatique de livres : la génération d'images ou de texte intégrée viendra en phase 3, à la demande de Guillaume ; l'agent connecté reste le premier moteur.

## Principes

1. **Le livre d'abord.** L'interface est sobre (noir, blanc, or, Geist, design de Pro-Resa) pour que seul le livre porte la couleur et les polices fantaisie.
2. **Parité humain / agent.** Tout ce que l'interface fait passe par la même API que l'agent ([ADR-0002](decisions/0002-agents-par-cle-api-et-mcp.md)). Exceptions volontaires : supprimer un livre, gérer les clés et les polices perso restent humains.
3. **Rien ne se perd.** Chaque modification est attribuée (humain ou nom de la clé) et restaurable. Un agent qui se trompe ne coûte qu'un clic.
4. **Zéro texte superflu.** Infobulles plutôt que paragraphes, une action principale par écran.
5. **Auto-hébergé et portable.** Une image Docker, un dossier de données. Ça tourne sur le VPS comme sur le NAS ([ADR-0001](decisions/0001-application-unique-sqlite.md)).

## Besoins anticipés (non cités dans la demande de départ)

| # | Besoin | Pourquoi | Phase |
|---|---|---|---|
| 1 | **Connexion par mot de passe**, sessions sûres, anti-force brute | L'outil est exposé sur Internet | 1 |
| 2 | **Brief du livre** (âge, ton, longueur, personnages, style d'illustration) lu par l'agent | Sans cadre, l'agent écrit « à côté » ; c'est la mémoire du livre | 1 |
| 3 | **Brief d'illustration** par double page | Dit ce que l'image doit montrer : guide l'agent, un illustrateur ou un futur générateur | 1 |
| 4 | **Échanges** humain ↔ agent par page (demandes, réponses, résolu) | C'est la boîte de réception de l'agent : « rends la page 3 plus drôle » | 1 |
| 5 | **Historique et restauration** par double page | Annuler ce que l'agent a fait sans perdre le reste | 1 |
| 6 | **Direct** : l'écran se met à jour quand l'agent écrit ; conflit signalé si les deux écrivent | Travailler *ensemble*, pas chacun son tour | 1 |
| 7 | **Formats de livre** (20×20, 21×28, paysage…), fonds perdus, alerte de résolution (< 300 dpi) | Le livre doit pouvoir s'imprimer | 1 |
| 8 | **Couverture** (et 4ᵉ de couverture en phase 4) | La bibliothèque montre des couvertures ; un livre en a une | 1 |
| 9 | **Mode lecture** plein écran (feuilleter au clavier ou au doigt) | Relire comme un enfant le lira | 1 |
| 10 | **Impression PDF** à la taille réelle, page de titre en recto | Premier export utile ; pagination correcte pour l'imprimeur | 1 |
| 11 | **Clés API à portée** (lecture / écriture), révocables, dernière utilisation | Sécurité ; un agent de relecture n'a pas besoin d'écrire | 1 |
| 12 | **Serveur MCP** (clé, puis OAuth pour claude.ai le 03/10) | Brancher Claude (claude.ai, Desktop, mobile, Code, Cowork) sans écrire de code | 1 |
| 13 | **Compteur de mots** par page et total, cible selon l'âge | Repère classique de l'album jeunesse | 1 |
| 14 | **Langue du livre** (césure, typographie française) | Guillemets, espaces fines, coupures de mots | 1 |
| 15 | **Thème clair / sombre** de l'interface | Confort de travail le soir | 1 |
| 16 | **Pas d'indexation** (`noindex`, `robots.txt`) | Livres privés, peut-être avec les prénoms des enfants | 1 |
| 17 | Fiches **personnages** avec images de référence | Cohérence des illustrations d'une page à l'autre | 2 — fait le 03/10 |
| 18 | **Export / import ZIP** d'un livre, **sauvegarde** du dossier de données | Ne rien perdre, déménager du VPS au NAS | 2 |
| 19 | **Dupliquer** un livre (variante, traduction) | Décliner une histoire | 2 |
| 20 | Mode **suggestion** : l'agent propose, l'humain accepte | Garder la main sur le texte final | 2 |
| 21 | **Génération d'illustrations** et aide à l'écriture intégrées (clés fournisseurs dans Paramètres) | Travailler sans agent externe | 3 |
| 22 | **Lien de lecture privé** pour la famille | Faire lire avant d'imprimer | 4 |
| 23 | **Export imprimeur** (PDF/X, couverture à plat avec dos), **EPUB** mise en page fixe | Imprimer pour de vrai, lire sur tablette | 4 |
| 24 | **Narration audio** (synthèse vocale) | Livre lu pour les plus petits | 4 |

## Indicateurs simples

- Un livre de 12 doubles pages peut passer de « Idée » à « Terminé » sans quitter La Fabrique.
- Un agent branché par MCP sait, sans autre consigne, lire le brief, traiter les demandes ouvertes et signaler ce qu'il a fait.
- Une restauration remet une page dans son état précédent en un clic.
