# Actions à réaliser par Guillaume

> Ce que **toi seul** peux débloquer ou trancher. Les sessions ajoutent ce qui bloque et cochent ce qui est fait. Coche une case ou ajoute une note dès que tu as agi. Tant qu'une décision n'est pas prise, la valeur par défaut indiquée s'applique.

## Pour mettre en ligne (bloquant pour F1.13)

- [x] **Créer la branche `main`** — fait le 03/10. Les sessions poussent désormais directement sur `main`. Si `claude/modest-cerf-f9nqik` est encore la branche par défaut sur GitHub, la remplacer par `main` (Settings › General › Default branch), puis supprimer l'ancienne branche.
- [ ] **Choisir le serveur** — les deux sont prêts ([procédure](tech/03-deploiement.md)) :
  - **NAS** (ma recommandation) : `guillaume-barbier.com` y sert déjà To Do Love, les livres restent à la maison, Hyper Backup sauvegarde le dossier. Inconvénient : dépend de la connexion de la maison (l'agent doit joindre l'outil depuis Internet).
  - **VPS KVM4** (à côté de Pro-Resa) : toujours joignable, Traefik et GHCR déjà en place. Inconvénient : mélange un outil perso avec la prod de Pro-Resa.
- [ ] **DNS** : enregistrement `lafabrique.guillaume-barbier.com` → IP de la maison (NAS, comme `todo`) ou `187.77.170.17` (KVM4).
- [ ] **NAS seulement** : passer le paquet GHCR `lafabrique` en **Public** après le premier build vert (le KVM4, lui, est déjà connecté à GHCR). Avant de lancer la tâche DSM, vérifier la liste des applis surveillées par Watchtower : le script la remplace par `to-do-love lafabrique`.
- [ ] **Premier lancement** : ouvrir l'adresse **juste après le déploiement** et créer ton compte (le premier visiteur crée le compte). Mieux : remplir `SETUP_TOKEN` dans le script NAS ou le `.env` du VPS, puis le vider une fois le compte créé.
- [ ] **Minutes GitHub Actions** : si le quota du compte est épuisé (arrivé sur Pro-Resa), passer les deux workflows sur le runner du KVM4 (`runs-on: [self-hosted, kvm4]`, une ligne chacun) après l'avoir enregistré pour ce dépôt.
- [x] **Brancher un agent** — fait le 03/10 (premiers essais concluants).

## Personnages (03/10, F2.1)

- [ ] **Essayer l'espace « Personnages »** (cinq minutes, une fois le déploiement passé) : dans un livre, entrée « Personnages » en haut des vignettes ; créer une fiche, déposer une ou deux images de référence et les légender (« face », « profil »…) ; cocher le personnage sur une double page (onglet Page). Puis demander à ton agent qui illustre d'appeler `get_references` avec la double page : il doit voir l'image et recevoir des liens `signedUrl`. Dis-moi si un générateur d'images refuse ces liens.
- [ ] **Agent déjà connecté par MCP** : le relancer (ou rouvrir la conversation) pour qu'il voie les nouveaux outils et les consignes mises à jour.

## Connecteur claude.ai (03/10, F2.8)

- [ ] **Vérifier `APP_URL`** sur le serveur : elle doit valoir exactement `https://lafabrique.guillaume-barbier.com` (déjà dans le script NAS et le compose VPS ; si tu as lancé le conteneur autrement, l'ajouter). Sinon claude.ai refuse la connexion.
- [ ] **Ajouter le connecteur** (deux minutes, une fois le déploiement passé) : claude.ai › Paramètres › Connecteurs › Ajouter un connecteur personnalisé ; nom `La Fabrique` ; URL `https://lafabrique.guillaume-barbier.com/api/mcp` ; rien dans les champs OAuth avancés ; « Se connecter » ; dans La Fabrique, choisir le nom de l'agent (par ex. « Claude ») et « Lire et écrire ». Puis dans une conversation : « Liste mes livres La Fabrique ». Dis-moi si une étape coince (message exact).
- [ ] **Ensuite**, la clé API créée pour tes premiers essais peut rester (Claude Code, scripts) ou être révoquée si tout passe par le connecteur.

## Agent autonome (04/10, F2.11)

- [ ] **Autoriser le domaine dans le bac à sable de ton agent** : là où Claude exécute du code (claude.ai : réglages de l'exécution de code, accès réseau / domaines autorisés ; Cowork : idem), ajouter `lafabrique.guillaume-barbier.com`. Sans ça, `curl -T` vers l'URL d'envoi échoue et l'agent retombera sur le navigateur.
- [ ] **Rouvrir la conversation de l'agent** pour qu'il charge les nouveaux outils (`create_upload`, `commit_upload`, séries, `check_text`, planche contact) et les paramètres en snake_case.
- [ ] **Faire de ton livre modèle une série** (deux minutes) : demande à ton agent « crée la série Victoire et Constance depuis le livre klet7691081m (`create_series` avec `from_book_id`), avec la règle : pas de guillemets, toujours Mama jamais Maman, puis étiquette les 5 images de chaque personnage (face, profil droit, profil gauche, dos, visage) ». Les livres suivants : `create_book` avec `series_id`. Je ne l'ai pas fait moi-même : c'est ton livre en ligne.
- [ ] **Génération intégrée (F3.2)** : chiffrée dans la feuille de route (1 à 2 sessions ; quelques dollars par livre selon le modèle). Dis-moi si tu veux la lancer, et avec quel modèle (Imagen 4 ou Gemini Image).

## Décisions produit (valeurs par défaut appliquées en attendant)

- [ ] **Couleur d'accent de l'interface** : or `#EFBF04` de Pro-Resa. Une autre couleur se change en une ligne (`src/styles/tokens.css`). L'agent a sa propre couleur, violette, pour qu'on voie ce qu'il fait.
- [ ] **Format par défaut d'un nouveau livre** : carré 20 × 20 cm. Proposés aussi : 15 × 15, 21,6 × 21,6 (8,5″ KDP), 25 × 25, 21 × 28 portrait, 28 × 21 paysage. Un format manque ?
- [ ] **Imprimeur visé** (imprimeur local, Lulu, KDP…) : conditionne l'export de la phase 4 (fonds perdus, PDF/X, dos de couverture). En attendant : PDF du navigateur, à taille réelle, fonds perdus 3 mm en option.
- [ ] **Génération intégrée (phase 3)** : veux-tu générer les illustrations *dans* La Fabrique (fournisseur à choisir : OpenAI, Google, fal/Flux…, avec ta clé), ou l'agent externe suffit-il ? Même question pour l'aide à l'écriture (clé Anthropic). Chiffrage Google : voir F3.2.
- [ ] **D'autres personnes** (famille, illustrateur) auront-elles un compte ? *Par défaut : un seul compte humain, des agents par clé.*
- [ ] **Mise en forme du texte** : as-tu besoin de mots en gras, en couleur ou en grand dans le texte (fréquent en album) ? Si oui, on le prévoit avec F2.6.
