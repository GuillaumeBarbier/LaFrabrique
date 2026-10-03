# Actions à réaliser par Guillaume

> Ce que **toi seul** peux débloquer ou trancher. Les sessions ajoutent ce qui bloque et cochent ce qui est fait. Coche une case ou ajoute une note dès que tu as agi. Tant qu'une décision n'est pas prise, la valeur par défaut indiquée s'applique.

## Pour mettre en ligne (bloquant pour F1.13)

- [ ] **Créer la branche `main`** depuis `claude/modest-cerf-f9nqik` et la mettre par défaut (GitHub › Settings › Branches). Le dépôt était vide : la branche de la session est devenue la branche par défaut. Le déploiement automatique part des pushs sur `main`.
- [ ] **Choisir l'hébergement** : VPS (KVM4, à côté de Pro-Resa, Traefik déjà en place) ou NAS. *Par défaut : KVM4*, parce que Traefik, Watchtower et la connexion GHCR y sont déjà. Les deux fichiers sont prêts : [`deploy/vps/docker-compose.yml`](../deploy/vps/docker-compose.yml) et [`deploy/nas/docker-compose.yml`](../deploy/nas/docker-compose.yml) — procédure dans [`tech/03-deploiement.md`](tech/03-deploiement.md).
- [ ] **DNS** : enregistrement `A` `lafabrique.guillaume-barbier.com` → IP du serveur choisi (KVM4 : `187.77.170.17`).
- [ ] **Minutes GitHub Actions** : le dépôt est-il privé ? Si le quota du compte est épuisé (c'est arrivé sur Pro-Resa), passer les deux workflows sur le runner du KVM4 (`runs-on: [self-hosted, kvm4]`, une ligne chacun) après avoir enregistré le runner pour ce dépôt.
- [ ] **Premier lancement** : ouvrir `https://lafabrique.guillaume-barbier.com` **juste après le déploiement** et créer ton compte. Le premier visiteur crée le compte propriétaire : ne pas laisser l'instance vierge en ligne. (Option : poser `SETUP_TOKEN` dans le `.env` pour exiger un code à la création — voir le compose.)

## Décisions produit (valeurs par défaut appliquées en attendant)

- [ ] **Couleur d'accent de l'interface** : or `#EFBF04` repris de Pro-Resa. Une autre couleur se change en une ligne (`src/styles/tokens.css`).
- [ ] **Format par défaut d'un nouveau livre** : carré 20 × 20 cm. Autres formats proposés : 15 × 15, 21,6 × 21,6 (KDP 8,5″), 25 × 25, 21 × 28 portrait, 28 × 21 paysage. Un format qui manque ?
- [ ] **Imprimeur visé** (imprimeur local, Lulu, KDP…) : conditionne l'export de la phase 4 (fonds perdus, PDF/X, dos de couverture).
- [ ] **Génération intégrée (phase 3)** : veux-tu générer les illustrations *dans* La Fabrique (fournisseur à choisir : OpenAI, Google, fal/Flux…, avec ta clé), ou l'agent externe suffit-il ? Même question pour l'aide à l'écriture (clé Anthropic).
- [ ] **claude.ai web** : veux-tu brancher La Fabrique comme connecteur dans claude.ai (et pas seulement Claude Code / Desktop) ? Cela demande un petit OAuth (F2.8).
- [ ] **D'autres personnes** (famille, illustrateur) auront-elles un compte ? *Par défaut : un seul compte humain, des agents par clé.*
