# Feuille de route

> **File de travail des sessions.** Une session prend **la première tâche non cochée** de la phase en cours, la termine, coche la case, écrit dans [`02-suivi.md`](02-suivi.md) et pousse. Une tâche trop grosse se découpe ici en sous-tâches (`F1.2a`, `F1.2b`…). Une tâche marquée ⏸ attend Guillaume ([`03-actions-guillaume.md`](03-actions-guillaume.md)) : on passe à la suivante.

## Vue d'ensemble

| Phase | But | État |
|---|---|---|
| 0 — Socle | Dépôt, docs, app, base, connexion, Docker | Fait (mise en ligne ⏸) |
| 1 — Atelier (MVP) | Créer un livre de A à Z avec un agent branché | Fait, recette en ligne ⏸ |
| 2 — Collaboration avancée | Personnages, sauvegardes, suggestions, duplication | À venir |
| 3 — Génération intégrée | Illustrations et aide à l'écriture dans l'app | ⏸ choix du fournisseur |
| 4 — Édition | Export imprimeur, EPUB, lien de lecture, audio | À venir |

## Phase 0 — Socle

- [x] **F0.1 — Dépôt et documentation** : vision, feuille de route, suivi, actions, ADR 0001 à 0005, briefs produit / tech / design.
- [x] **F0.2 — Application** : Next.js (App Router), TypeScript strict, ESLint, Vitest ; tokens du design system ; composants de base (bouton, champ, liste déroulante, interrupteur, segment, infobulle, fenêtre, notification).
- [x] **F0.3 — Données** : SQLite (WAL) dans `DATA_DIR`, migrations versionnées jouées au démarrage, fichiers (illustrations, polices) à côté.
- [x] **F0.4 — Connexion** : premier lancement = création du compte ; mot de passe (scrypt), sessions en base (cookie `HttpOnly`), limitation des essais, `noindex` partout.
- [x] **F0.5 — Docker et déploiement** : image `node:22-slim` (amd64) publiée sur GHCR à chaque push sur `main`, compose VPS (Traefik) et tâche DSM pour le NAS, image testée en conteneur. Mise en ligne ⏸ (choix VPS/NAS, DNS, branche `main`).
- [x] **F0.6 — CI** : typecheck, lint, tests, build à chaque push.

## Phase 1 — Atelier (MVP)

- [x] **F1.1 — Bibliothèque** : couvertures au format du livre, titre, **statut sous le titre**, avancement (doubles pages complètes), filtres (tous, en cours, terminés, archivés), recherche, création, archivage, suppression en deux temps.
- [x] **F1.2 — Éditeur de doubles pages** : vignettes, ajout, déplacement, suppression ; illustration à gauche (téléverser, glisser-déposer, cadrage remplir/contenir) ; texte à droite, enregistré tout seul ; brief d'illustration ; notes ; couverture.
- [x] **F1.3 — Typographies** : catalogue de Google Fonts auto-hébergées pour l'enfance ([liste](design/02-typographies.md)), police du titre et du texte, taille en points, interligne, alignements, couleurs de texte et de page ; polices personnelles téléversées (TTF, OTF, WOFF, WOFF2).
- [x] **F1.4 — Paramètres** : compte (nom, e-mail, mot de passe), agents IA (clés à portée lecture/écriture, montrées une fois, révocables, dernière utilisation, mode d'emploi à copier), typographies, apparence (clair, sombre, auto).
- [x] **F1.5 — API REST `/api/v1`** : session ou clé, actions attribuées, mêmes routes pour l'interface et l'agent.
- [x] **F1.6 — Serveur MCP** `/api/mcp` : outils pour lire, écrire, illustrer, commenter ; consignes de travail intégrées.
- [x] **F1.7 — Échanges** : fils par livre et par double page, demandes adressées à l'agent ou à l'humain, résolution ; boîte de réception de l'agent.
- [x] **F1.8 — Historique** : chaque modification attribuée, regroupée par auteur (5 min), restauration en un clic, y compris d'une page supprimée.
- [x] **F1.9 — Direct** : flux d'événements (SSE) par livre ; l'éditeur se recharge quand l'agent écrit ; conflit signalé si les deux modifient la même page.
- [x] **F1.10 — Mode lecture** : plein écran, couverture puis doubles pages, flèches, glisser, Échap.
- [x] **F1.11 — Impression PDF** (par le navigateur) : taille réelle, fonds perdus en option, page de titre en recto, avertissements (résolution < 300 dpi, nombre de pages non multiple de 4).
- [x] **F1.12 — Brief du livre** : âge, langue, ton, longueur cible, personnages et style d'illustration en texte libre ; compteur de mots par page et total.
- [ ] **F1.13 — Recette en conditions réelles** : un livre de bout en bout avec Claude branché par MCP sur l'instance en ligne ; noter les frictions dans `02-suivi.md`. ⏸ mise en ligne.

## Phase 2 — Collaboration avancée

- [ ] **F2.1 — Personnages** : fiche (nom, description, apparence, image de référence), exposée à l'agent (`get_book`, outils dédiés).
- [ ] **F2.2 — Export / import ZIP d'un livre** : JSON + illustrations + polices utilisées ; import qui recrée le livre.
- [ ] **F2.3 — Sauvegardes** : copie à chaud de la base (`VACUUM INTO`) + fichiers, rotation ; doc NAS (Hyper Backup) et VPS.
- [ ] **F2.4 — Dupliquer un livre** (variante, traduction).
- [ ] **F2.5 — Mode suggestion** : l'agent propose un texte sur une page, l'humain accepte ou refuse ; réglable par clé (« écrire directement » / « proposer »).
- [ ] **F2.6 — Confort d'édition** : glisser-déposer des vignettes, raccourcis clavier, zoom, mise en forme légère du texte (gras, italique, mots en grand).
- [ ] **F2.7 — Second facteur** (TOTP, codes de secours) si l'outil reste exposé sur Internet.
- [ ] **F2.8 — Connecteur claude.ai** : OAuth sur le serveur MCP pour l'ajouter comme connecteur personnalisé dans claude.ai (le web et l'app ne savent pas envoyer une clé en en-tête). ⏸ besoin à confirmer.
- [ ] **F2.9 — Tests de bout en bout** (Playwright) des parcours bibliothèque → éditeur → impression. Le script de la session de lancement (connexion, saisie, conflit, direct, téléversement) peut servir de point de départ ([`02-suivi.md`](02-suivi.md), R-04).
- [ ] **F2.10 — Ménage des fichiers** : illustrations remplacées et jamais restaurées (aujourd'hui gardées pour l'historique), après 90 jours.

## Phase 3 — Génération intégrée ⏸

> Attend le choix de Guillaume ([`03-actions-guillaume.md`](03-actions-guillaume.md)) : fournisseur d'images, budget, et si l'agent externe suffit.

- [ ] **F3.1 — Clés fournisseurs** dans Paramètres, chiffrées au repos.
- [ ] **F3.2 — Générer une illustration** depuis le brief d'illustration, le style du livre et les images de référence des personnages ; plusieurs propositions, choix, historique.
- [ ] **F3.3 — Aide à l'écriture** : simplifier pour l'âge, rimer, raccourcir, traduire.
- [ ] **F3.4 — Suivi des coûts** par livre, plafond mensuel.

## Phase 4 — Édition

- [ ] **F4.1 — Export imprimeur côté serveur** : PDF avec fonds perdus et traits de coupe, couverture à plat avec dos calculé selon le papier et le nombre de pages.
- [ ] **F4.2 — Pages de structure** : 4ᵉ de couverture, pages de garde, page de titre et colophon réglables.
- [ ] **F4.3 — EPUB** mise en page fixe (tablette).
- [ ] **F4.4 — Lien de lecture privé** (jeton, expiration, révocable) pour la famille.
- [ ] **F4.5 — Narration audio** par page (synthèse vocale), lecture dans le mode lecture.
