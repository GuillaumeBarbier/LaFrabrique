# Actions à réaliser par Guillaume

> Ce que **toi seul** peux débloquer ou trancher. Les sessions ajoutent ce qui bloque et cochent ce qui est fait. Coche une case ou ajoute une note dès que tu as agi. Tant qu'une décision n'est pas prise, la valeur par défaut indiquée s'applique.

## Pour mettre en ligne (bloquant pour F1.13)

- [ ] **Créer la branche `main`** depuis `claude/modest-cerf-f9nqik` et la mettre par défaut (GitHub › Settings › General › Default branch). Le dépôt était vide : la branche de la session est devenue celle par défaut. La publication de l'image part des pushs sur `main`.
- [ ] **Choisir le serveur** — les deux sont prêts ([procédure](tech/03-deploiement.md)) :
  - **NAS** (ma recommandation) : `guillaume-barbier.com` y sert déjà To Do Love, les livres restent à la maison, Hyper Backup sauvegarde le dossier. Inconvénient : dépend de la connexion de la maison (l'agent doit joindre l'outil depuis Internet).
  - **VPS KVM4** (à côté de Pro-Resa) : toujours joignable, Traefik et GHCR déjà en place. Inconvénient : mélange un outil perso avec la prod de Pro-Resa.
- [ ] **DNS** : enregistrement `lafabrique.guillaume-barbier.com` → IP de la maison (NAS, comme `todo`) ou `187.77.170.17` (KVM4).
- [ ] **NAS seulement** : passer le paquet GHCR `lafabrique` en **Public** après le premier build vert (le KVM4, lui, est déjà connecté à GHCR). Avant de lancer la tâche DSM, vérifier la liste des applis surveillées par Watchtower : le script la remplace par `to-do-love lafabrique`.
- [ ] **Premier lancement** : ouvrir l'adresse **juste après le déploiement** et créer ton compte (le premier visiteur crée le compte). Mieux : remplir `SETUP_TOKEN` dans le script NAS ou le `.env` du VPS, puis le vider une fois le compte créé.
- [ ] **Minutes GitHub Actions** : si le quota du compte est épuisé (arrivé sur Pro-Resa), passer les deux workflows sur le runner du KVM4 (`runs-on: [self-hosted, kvm4]`, une ligne chacun) après l'avoir enregistré pour ce dépôt.
- [ ] **Brancher Claude** une fois en ligne : Paramètres › Agents IA › « Créer une clé », puis la commande affichée dans Claude Code.

## Décisions produit (valeurs par défaut appliquées en attendant)

- [ ] **Couleur d'accent de l'interface** : or `#EFBF04` de Pro-Resa. Une autre couleur se change en une ligne (`src/styles/tokens.css`). L'agent a sa propre couleur, violette, pour qu'on voie ce qu'il fait.
- [ ] **Format par défaut d'un nouveau livre** : carré 20 × 20 cm. Proposés aussi : 15 × 15, 21,6 × 21,6 (8,5″ KDP), 25 × 25, 21 × 28 portrait, 28 × 21 paysage. Un format manque ?
- [ ] **Imprimeur visé** (imprimeur local, Lulu, KDP…) : conditionne l'export de la phase 4 (fonds perdus, PDF/X, dos de couverture). En attendant : PDF du navigateur, à taille réelle, fonds perdus 3 mm en option.
- [ ] **Génération intégrée (phase 3)** : veux-tu générer les illustrations *dans* La Fabrique (fournisseur à choisir : OpenAI, Google, fal/Flux…, avec ta clé), ou l'agent externe suffit-il ? Même question pour l'aide à l'écriture (clé Anthropic).
- [ ] **claude.ai web/mobile** : veux-tu brancher La Fabrique comme connecteur dans claude.ai (et pas seulement Claude Code / Desktop) ? Cela demande un petit OAuth (F2.8).
- [ ] **D'autres personnes** (famille, illustrateur) auront-elles un compte ? *Par défaut : un seul compte humain, des agents par clé.*
- [ ] **Mise en forme du texte** : as-tu besoin de mots en gras, en couleur ou en grand dans le texte (fréquent en album) ? Si oui, on le prévoit avec F2.6.
