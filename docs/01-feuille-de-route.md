# Feuille de route

> **File de travail des sessions.** Une session prend **la première tâche non cochée** de la phase en cours, la termine, coche la case, écrit dans [`02-suivi.md`](02-suivi.md) et pousse. Une tâche trop grosse se découpe ici en sous-tâches (`F1.2a`, `F1.2b`…). Une tâche marquée ⏸ attend Guillaume ([`03-actions-guillaume.md`](03-actions-guillaume.md)) : on passe à la suivante.

## Vue d'ensemble

| Phase | But | État |
|---|---|---|
| 0 — Socle | Dépôt, docs, app, base, connexion, Docker | Fait (mise en ligne ⏸) |
| 1 — Atelier (MVP) | Créer un livre de A à Z avec un agent branché | Fait, recette en ligne ⏸ |
| 2 — Collaboration avancée | Personnages, agent autonome, séries, sauvegardes, suggestions | En cours |
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

- [x] **F2.1 — Personnages** (demandé par Guillaume le 03/10, [ADR-0006](decisions/0006-personnages-et-references.md)) : fiche (nom, rôle, apparence), images de référence étiquetées avec une principale, personnages présents par double page, `get_references` pour l'agent qui illustre avec liens temporaires 24 h, historique et restauration.
- [ ] **F2.1b — Références de style** : planches d'ambiance et palette au niveau du livre, servies avec les personnages par `get_references`. *Le style en texte (`illustration_style`, série et livre) est fait (F2.11) ; restent les images d'ambiance.*
- [ ] **F2.2 — Export / import ZIP d'un livre** : JSON + illustrations + polices utilisées ; import qui recrée le livre.
- [ ] **F2.3 — Sauvegardes** : copie à chaud de la base (`VACUUM INTO`) + fichiers, rotation ; doc NAS (Hyper Backup) et VPS.
- [ ] **F2.4 — Dupliquer un livre** (variante, traduction). *La mise en place sans les pages existe (`clone_book_setup`, F2.11) ; reste la copie complète avec les pages.*
- [ ] **F2.5 — Mode suggestion** : l'agent propose un texte sur une page, l'humain accepte ou refuse ; réglable par clé (« écrire directement » / « proposer »).
- [ ] **F2.6 — Confort d'édition** : glisser-déposer des vignettes, raccourcis clavier, zoom, mise en forme légère du texte (gras, italique, mots en grand).
- [ ] **F2.7 — Second facteur** (TOTP, codes de secours) si l'outil reste exposé sur Internet.
- [x] **F2.8 — Connecteur claude.ai** (demandé par Guillaume le 03/10, [ADR-0007](decisions/0007-connecteur-oauth.md)) : OAuth 2.1 sur le serveur MCP — découverte, CIMD et enregistrement dynamique, consentement qui nomme l'agent et fixe sa portée, PKCE, rotation des jetons, connexions révocables dans Paramètres. Testé de bout en bout avec le client MCP officiel.
- [ ] **F2.9 — Tests de bout en bout** (Playwright) des parcours bibliothèque → éditeur → impression. Le script de la session de lancement (connexion, saisie, conflit, direct, téléversement) peut servir de point de départ ([`02-suivi.md`](02-suivi.md), R-04).
- [ ] **F2.10 — Ménage des fichiers** : illustrations remplacées et jamais restaurées (aujourd'hui gardées pour l'historique), après 90 jours.
- [x] **F2.11 — Agent autonome** (demandé par Guillaume le 04/10, [ADR-0008](decisions/0008-agent-autonome-envois-series-regles.md)) : envoi de fichiers locaux par URL signée à usage unique (`create_upload` → `curl -T` → `commit_upload`, plusieurs fichiers, dpi et avertissements, jamais de refus) ; personnages avec vues normalisées, position, copie, réordonnancement ; **séries** (personnages partagés, style, règles, valeurs par défaut ; `create_series` depuis un livre modèle, `create_book(series_id)`, `clone_book_setup`) ; **règles d'écriture** en données (`writing_rules`, `quote_style`, `forbidden_words`, `check_text`) ; MCP strict en snake_case, réponses courtes, `get_book` résumé, planche contact ; historique détaillé des images. Exemple de bout en bout : `scripts/exemple-serie.mjs`.
- [ ] **F2.12 — Interface des séries** : page Série (créer depuis un livre, fiches partagées, style et règles) ; aujourd'hui l'humain voit la série dans le livre (badge, règles du livre) et l'agent la gère.

## Phase 3 — Génération intégrée ⏸

> Attend le choix de Guillaume ([`03-actions-guillaume.md`](03-actions-guillaume.md)) : fournisseur d'images, budget, et si l'agent externe suffit.

- [ ] **F3.1 — Clés fournisseurs** dans Paramètres, chiffrées au repos.
- [ ] **F3.2 — Générer une illustration** depuis le brief d'illustration, le style du livre et les images de référence des personnages ; plusieurs propositions, choix, historique. *Chiffrage du 04/10 (ADR-0008, § 6 de la demande) : outils `generate_illustration(spread_id, prompt?, reference_character_ids?, count 1–4)` et `select_illustration_variant` ; table des propositions (variantes gardées sans écraser l'illustration), clé Google chiffrée (F3.1), quota mensuel (F3.4). Travail : 1 à 2 sessions. Coût API indicatif (tarifs publics relevés par des tiers, à vérifier sur ai.google.dev/pricing) : Imagen 4 0,02 à 0,06 $ l'image ; Gemini 3.1 Flash Image 0,045 à 0,15 $ ; Gemini 3 Pro Image 0,134 $ (1K/2K) à 0,24 $ (4K). Un livre de 12 doubles pages + couverture avec 4 propositions chacune = 52 images ≈ 2 à 8 $ en Flash, 7 à 12,50 $ en Pro 4K (la 4K approche les 2 434 px requis à 300 dpi ; en dessous, l'avertissement `lowResolution` le dira).*
- [ ] **F3.3 — Aide à l'écriture** : simplifier pour l'âge, rimer, raccourcir, traduire.
- [ ] **F3.4 — Suivi des coûts** par livre, plafond mensuel.

## Phase 4 — Édition

- [ ] **F4.1 — Export imprimeur côté serveur** : PDF avec fonds perdus et traits de coupe, couverture à plat avec dos calculé selon le papier et le nombre de pages.
- [ ] **F4.2 — Pages de structure** : 4ᵉ de couverture, pages de garde, page de titre et colophon réglables.
- [ ] **F4.3 — EPUB** mise en page fixe (tablette).
- [ ] **F4.4 — Lien de lecture privé** (jeton, expiration, révocable) pour la famille.
- [ ] **F4.5 — Narration audio** par page (synthèse vocale), lecture dans le mode lecture.
